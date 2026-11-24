package appstore

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func TestAppStoreService(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir, DryRun: true}
	svc := New(cfg, nil, nil)

	// 1. Catalog
	catalog := svc.GetCatalog()
	if len(catalog) < 6 {
		t.Fatalf("expected at least 6 apps in catalog, got %d", len(catalog))
	}

	tmpl, err := svc.GetTemplate("ghost")
	if err != nil {
		t.Fatalf("GetTemplate ghost: %v", err)
	}
	if tmpl.DefaultPort != 2368 {
		t.Errorf("expected default port 2368, got %d", tmpl.DefaultPort)
	}

	// 2. Install
	ctx := context.Background()
	app, err := svc.Install(ctx, InstallAppInput{
		TemplateID: "ghost",
		Domain:     "myghost.blog",
		Port:       2368,
		EnvVars: map[string]string{
			"url": "http://myghost.blog",
		},
	})
	if err != nil {
		t.Fatalf("Install failed: %v", err)
	}
	if app.Domain != "myghost.blog" || app.Status != "running" {
		t.Errorf("unexpected installed app: %+v", app)
	}

	// 3. List installed
	list := svc.ListInstalled()
	if len(list) != 1 {
		t.Fatalf("expected 1 installed app, got %d", len(list))
	}

	// 4. Action: stop
	actRes, err := svc.Action(ctx, app.ID, "stop")
	if err != nil {
		t.Fatalf("Action stop failed: %v", err)
	}
	if actRes.Status != "stopped" {
		t.Errorf("expected status stopped, got %s", actRes.Status)
	}

	// 5. Action: start
	actRes, err = svc.Action(ctx, app.ID, "start")
	if err != nil {
		t.Fatalf("Action start failed: %v", err)
	}
	if actRes.Status != "running" {
		t.Errorf("expected status running, got %s", actRes.Status)
	}

	// 6. Logs
	logs, err := svc.GetLogs(ctx, app.ID, 50)
	if err != nil {
		t.Fatalf("GetLogs failed: %v", err)
	}
	if !strings.Contains(logs, "started successfully") {
		t.Errorf("expected logs to contain 'started successfully', got: %s", logs)
	}

	// 7. Uninstall
	if err := svc.Uninstall(ctx, app.ID); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}
	if len(svc.ListInstalled()) != 0 {
		t.Errorf("expected 0 installed apps after uninstall")
	}
}

func TestCatalogNewTemplates(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir, DryRun: true}
	svc := New(cfg, nil, nil)

	expected := []struct {
		id   string
		port int
	}{
		{"redis", 6379},
		{"mongodb", 27017},
		{"pocketbase", 8090},
		{"meilisearch", 7700},
	}

	for _, tc := range expected {
		tmpl, err := svc.GetTemplate(tc.id)
		if err != nil {
			t.Fatalf("expected catalog to contain %q: %v", tc.id, err)
		}
		if tmpl.DefaultPort != tc.port {
			t.Errorf("template %s expected default port %d, got %d", tc.id, tc.port, tmpl.DefaultPort)
		}
		if !strings.Contains(tmpl.ComposeYAML, "services:") {
			t.Errorf("template %s compose YAML missing services:", tc.id)
		}
	}
}

func TestInstallCustomApp(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir, DryRun: true}
	svc := New(cfg, nil, nil)
	ctx := context.Background()

	customCompose := `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "8081:80"
    environment:
      - APP_ENV=production
`

	in := InstallCustomAppInput{
		Name:        "custom-nginx",
		Domain:      "nginx.example.com",
		ComposeYAML: customCompose,
		EnvVars: map[string]string{
			"CUSTOM_KEY": "custom_val_123",
		},
	}

	app, err := svc.InstallCustom(ctx, in)
	if err != nil {
		t.Fatalf("InstallCustom failed: %v", err)
	}

	if app.Name != "custom-nginx" {
		t.Errorf("expected name custom-nginx, got %s", app.Name)
	}
	if app.Domain != "nginx.example.com" {
		t.Errorf("expected domain nginx.example.com, got %s", app.Domain)
	}
	if app.Port != 8081 {
		t.Errorf("expected port 8081 extracted from compose, got %d", app.Port)
	}
	if app.TemplateID != "custom" {
		t.Errorf("expected templateId custom, got %s", app.TemplateID)
	}

	// Verify docker-compose.yml written
	composeFile := filepath.Join(app.AppDir, "docker-compose.yml")
	content, err := os.ReadFile(composeFile)
	if err != nil {
		t.Fatalf("failed to read compose file: %v", err)
	}
	if string(content) != customCompose {
		t.Errorf("compose file content mismatch")
	}

	// Verify .env written
	envFile := filepath.Join(app.AppDir, ".env")
	envContent, err := os.ReadFile(envFile)
	if err != nil {
		t.Fatalf("failed to read .env file: %v", err)
	}
	envStr := string(envContent)
	if !strings.Contains(envStr, "APP_NAME=custom-nginx") {
		t.Errorf(".env missing APP_NAME: %s", envStr)
	}
	if !strings.Contains(envStr, "CUSTOM_KEY=custom_val_123") {
		t.Errorf(".env missing CUSTOM_KEY: %s", envStr)
	}

	// Test list installed
	installed := svc.ListInstalled()
	if len(installed) != 1 || installed[0].ID != app.ID {
		t.Fatalf("expected 1 installed app with ID %s", app.ID)
	}

	// Test lifecycle actions
	res, err := svc.Action(ctx, app.ID, "stop")
	if err != nil || res.Status != "stopped" {
		t.Fatalf("Action stop failed: %v, res: %+v", err, res)
	}

	res, err = svc.Action(ctx, app.ID, "start")
	if err != nil || res.Status != "running" {
		t.Fatalf("Action start failed: %v, res: %+v", err, res)
	}

	logs, err := svc.GetLogs(ctx, app.ID, 50)
	if err != nil || !strings.Contains(logs, "custom-nginx") {
		t.Fatalf("GetLogs failed: %v, logs: %s", err, logs)
	}

	// Test uninstall
	if err := svc.Uninstall(ctx, app.ID); err != nil {
		t.Fatalf("Uninstall failed: %v", err)
	}
	if len(svc.ListInstalled()) != 0 {
		t.Errorf("expected 0 apps after uninstall")
	}
}

func TestInstallCustomValidationErrors(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir, DryRun: true}
	svc := New(cfg, nil, nil)
	ctx := context.Background()

	// 1. Missing name
	_, err := svc.InstallCustom(ctx, InstallCustomAppInput{
		Name:        "",
		ComposeYAML: "services:\n  web:\n    image: nginx",
	})
	if err == nil {
		t.Fatal("expected error on missing name")
	}

	// 2. Invalid characters in name
	_, err = svc.InstallCustom(ctx, InstallCustomAppInput{
		Name:        "invalid/name!!",
		ComposeYAML: "services:\n  web:\n    image: nginx",
	})
	if err == nil {
		t.Fatal("expected error on invalid characters in name")
	}

	// 3. Empty compose YAML
	_, err = svc.InstallCustom(ctx, InstallCustomAppInput{
		Name:        "test-app",
		ComposeYAML: "   ",
	})
	if err == nil {
		t.Fatal("expected error on empty compose YAML")
	}

	// 4. Missing services section
	_, err = svc.InstallCustom(ctx, InstallCustomAppInput{
		Name:        "test-app",
		ComposeYAML: "version: '3.8'\nnetworks:\n  test:\n",
	})
	if err == nil {
		t.Fatal("expected error on compose YAML missing services section")
	}

	// 5. Tabs in YAML
	_, err = svc.InstallCustom(ctx, InstallCustomAppInput{
		Name:        "test-app",
		ComposeYAML: "services:\n\tweb:\n\t\timage: nginx",
	})
	if err == nil {
		t.Fatal("expected error on YAML containing tab indentation")
	}
}

func TestInstallCustomWithSiteSvcProxy(t *testing.T) {
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	cfg := config.Config{
		StateDir:      stateDir,
		NginxSitesDir: filepath.Join(dir, "nginx", "sites-available"),
		LogDir:        filepath.Join(dir, "logs"),
		DryRun:        true,
	}
	st, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	eng := tasks.New(st, context.Background())
	siteSvc := sites.New(st, eng, auditLog, cfg)

	svc := New(cfg, siteSvc, auditLog)
	ctx := context.Background()

	in := InstallCustomAppInput{
		Name:   "proxy-app",
		Domain: "myapp.test",
		ComposeYAML: `version: '3.8'
services:
  app:
    image: myapp:1.0
    ports:
      - "3000:3000"
`,
	}

	app, err := svc.InstallCustom(ctx, in)
	if err != nil {
		t.Fatalf("InstallCustom failed: %v", err)
	}

	if app.Port != 3000 {
		t.Fatalf("expected extracted port 3000, got %d", app.Port)
	}

	// Check that site was created and nginx conf was written with reverse proxy
	confPath := filepath.Join(cfg.StateDir, "dryrun", "myapp.test.conf")
	confData, err := os.ReadFile(confPath)
	if err != nil {
		t.Fatalf("expected nginx config %s to be written: %v", confPath, err)
	}
	if !strings.Contains(string(confData), "proxy_pass http://127.0.0.1:3000/;") {
		t.Errorf("expected nginx config to contain reverse proxy to port 3000, got:\n%s", string(confData))
	}
}
