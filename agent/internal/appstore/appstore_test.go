package appstore

import (
	"context"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
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
