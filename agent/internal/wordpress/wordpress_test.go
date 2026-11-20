package wordpress

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

func newTestWordPressHarness(t *testing.T) (*Service, *store.Store, string) {
	t.Helper()
	dir := t.TempDir()

	st, err := store.Open(filepath.Join(dir, "store.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}

	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		StateDir:      dir,
		NginxSitesDir: filepath.Join(dir, "nginx"),
		Webroot:       filepath.Join(dir, "www"),
		LogDir:        filepath.Join(dir, "logs"),
		DryRun:        true,
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	wpSvc := New(cfg, siteSvc, nil, auditLog, eng)

	return wpSvc, st, dir
}

func addTestSite(t *testing.T, st *store.Store, baseDir, domain string) store.Site {
	t.Helper()
	siteRoot := filepath.Join(baseDir, "www", domain)
	_ = os.MkdirAll(siteRoot, 0o755)

	site := store.Site{
		Domain:     domain,
		Root:       siteRoot,
		PHPVersion: "8.3",
		Status:     store.SiteActive,
		CreatedAt:  store.Now(),
		UpdatedAt:  store.Now(),
	}
	if err := st.CreateSite(site); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}
	return site
}

func TestWordPressLifecycle(t *testing.T) {
	wpSvc, st, dir := newTestWordPressHarness(t)
	ctx := context.Background()
	domain := "myblog.test"
	addTestSite(t, st, dir, domain)

	// 1. Status initially reports not installed
	st1, err := wpSvc.Status(ctx, domain)
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if st1.Installed {
		t.Fatalf("expected Installed=false initially")
	}

	// 2. Install WordPress
	res, err := wpSvc.Install(ctx, domain, WPInstallRequest{
		SiteTitle:     "My Awesome Blog",
		AdminUser:     "admin",
		AdminEmail:    "admin@myblog.test",
		AdminPassword: "SuperSecretPassword123!",
		DBName:        "wp_myblog",
	})
	if err != nil {
		t.Fatalf("Install: %v", err)
	}
	if !res.Success {
		t.Fatalf("expected Install success")
	}
	if res.AdminUser != "admin" || res.DBName != "wp_myblog" {
		t.Fatalf("unexpected install result: %+v", res)
	}

	// 3. Status now reports installed with components
	st2, err := wpSvc.Status(ctx, domain)
	if err != nil {
		t.Fatalf("Status after install: %v", err)
	}
	if !st2.Installed {
		t.Fatalf("expected Installed=true after install")
	}
	if st2.DBName != "wp_myblog" {
		t.Fatalf("expected DBName=wp_myblog, got %s", st2.DBName)
	}

	// 4. Staging clone
	stagingRes, err := wpSvc.CloneToStaging(ctx, domain)
	if err != nil {
		t.Fatalf("CloneToStaging: %v", err)
	}
	if !stagingRes.Success {
		t.Fatalf("expected staging success")
	}
	if stagingRes.StagingDomain != "staging."+domain {
		t.Fatalf("expected staging domain %s, got %s", "staging."+domain, stagingRes.StagingDomain)
	}

	// Verify staging wp-config.php was created and updated
	stagingRoot := filepath.Join(dir, "www", "staging."+domain)
	content, err := os.ReadFile(filepath.Join(stagingRoot, "wp-config.php"))
	if err != nil {
		t.Fatalf("read staging wp-config.php: %v", err)
	}
	sContent := string(content)
	if !strings.Contains(sContent, "staging."+domain) {
		t.Fatalf("staging wp-config.php missing staging domain definition")
	}

	// 5. Magic Login Generation
	loginRes, err := wpSvc.GenerateMagicLogin(ctx, domain)
	if err != nil {
		t.Fatalf("GenerateMagicLogin: %v", err)
	}
	if !loginRes.Success {
		t.Fatalf("expected login success")
	}
	if !strings.Contains(loginRes.LoginURL, "cd_magic_token=") {
		t.Fatalf("expected login URL with magic token, got %s", loginRes.LoginURL)
	}

	// Verify MU-Plugin and token file created
	siteRoot := filepath.Join(dir, "www", domain)
	muFile := filepath.Join(siteRoot, "wp-content", "mu-plugins", "clouddeck-magic-login.php")
	if _, err := os.Stat(muFile); err != nil {
		t.Fatalf("mu-plugin missing: %v", err)
	}
	tokenFile := filepath.Join(siteRoot, "wp-content", ".clouddeck_login_token")
	if _, err := os.Stat(tokenFile); err != nil {
		t.Fatalf("token file missing: %v", err)
	}

	// 6. Update
	upRes, err := wpSvc.Update(ctx, domain, WPUpdateRequest{Target: "all"})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if !upRes.Success || len(upRes.Updated) == 0 {
		t.Fatalf("expected update success with updated components, got %+v", upRes)
	}
}
