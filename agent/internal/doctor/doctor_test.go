package doctor

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func TestDiagnoseSite(t *testing.T) {
	tmpDir := t.TempDir()
	docRoot := filepath.Join(tmpDir, "public_html")
	_ = os.MkdirAll(docRoot, 0o755)

	site := store.Site{
		Domain:     "health.test",
		Root:       docRoot,
		PHPVersion: "8.3",
	}

	svc := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()

	diag := svc.DiagnoseSite(ctx, site)
	if diag.Domain != "health.test" {
		t.Errorf("expected domain health.test, got %s", diag.Domain)
	}
	if diag.HealthScore < 50 {
		t.Errorf("expected reasonable health score, got %d", diag.HealthScore)
	}

	// Test remediation dry run
	msg, err := svc.FixSiteIssue(ctx, site, "fix_permissions")
	if err != nil {
		t.Fatalf("FixSiteIssue failed: %v", err)
	}
	if msg == "" {
		t.Errorf("expected remediation message")
	}

	msgExt, err := svc.FixSiteIssue(ctx, site, "install_extension")
	if err != nil {
		t.Fatalf("FixSiteIssue install_extension failed: %v", err)
	}
	if msgExt == "" {
		t.Errorf("expected install_extension message")
	}
}

func TestDiagnoseWordPressAndLaravelExtensions(t *testing.T) {
	tmpDir := t.TempDir()
	docRoot := filepath.Join(tmpDir, "wordpress")
	_ = os.MkdirAll(docRoot, 0o755)
	_ = os.WriteFile(filepath.Join(docRoot, "wp-config.php"), []byte("<?php // DB_HOST localhost:3306"), 0o644)

	site := store.Site{
		Domain:     "wp.test",
		Root:       docRoot,
		PHPVersion: "8.4",
	}

	svc := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()

	diag := svc.DiagnoseSite(ctx, site)
	if diag.Domain != "wp.test" {
		t.Errorf("expected wp.test, got %s", diag.Domain)
	}

	// Test Laravel
	docRootLaravel := filepath.Join(tmpDir, "laravel")
	_ = os.MkdirAll(docRootLaravel, 0o755)
	_ = os.WriteFile(filepath.Join(docRootLaravel, ".env"), []byte("APP_ENV=production"), 0o644)

	siteLaravel := store.Site{
		Domain:     "laravel.test",
		Root:       docRootLaravel,
		PHPVersion: "8.4",
	}

	diagLaravel := svc.DiagnoseSite(ctx, siteLaravel)
	if diagLaravel.Domain != "laravel.test" {
		t.Errorf("expected laravel.test, got %s", diagLaravel.Domain)
	}
}

func TestDiagnoseServer(t *testing.T) {
	svc := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()

	diag := svc.DiagnoseServer(ctx)
	if diag.HealthScore < 0 || diag.HealthScore > 100 {
		t.Errorf("invalid server health score: %d", diag.HealthScore)
	}

	msg, err := svc.FixServerIssue(ctx, "clean_apt_cache")
	if err != nil {
		t.Fatalf("FixServerIssue failed: %v", err)
	}
	if msg == "" {
		t.Errorf("expected remediation message")
	}
}
