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

func TestInvestigateLogs(t *testing.T) {
	svc := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()
	site := store.Site{
		Domain:     "example.com",
		Root:       "/var/www/example.com",
		PHPVersion: "8.3",
	}

	// 1. Permission error
	permLog := "2026/11/20 04:00:00 [error] 1234#0: *1 open() \"/var/www/example.com/index.php\" failed (13: Permission denied)"
	inv, err := svc.InvestigateLogs(ctx, site, permLog)
	if err != nil {
		t.Fatalf("InvestigateLogs: %v", err)
	}
	if inv.FixType != "fix_permissions" {
		t.Errorf("expected fix_permissions, got %q", inv.FixType)
	}

	// 2. Gateway / PHP-FPM error
	fpmLog := "2026/11/20 04:00:00 [error] 1234#0: *1 connect() to unix:/run/php/php8.3-fpm.sock failed (111: Connection refused) while connecting to upstream"
	invFpm, err := svc.InvestigateLogs(ctx, site, fpmLog)
	if err != nil {
		t.Fatalf("InvestigateLogs: %v", err)
	}
	if invFpm.FixType != "restart_php" {
		t.Errorf("expected restart_php, got %q", invFpm.FixType)
	}

	// 3. Missing extension error
	extLog := "PHP Fatal error:  Uncaught Error: Class 'PDO' not found in /var/www/example.com/db.php:10"
	invExt, err := svc.InvestigateLogs(ctx, site, extLog)
	if err != nil {
		t.Fatalf("InvestigateLogs: %v", err)
	}
	if invExt.FixType != "install_extension" {
		t.Errorf("expected install_extension, got %q", invExt.FixType)
	}

	// 4. MySQL auth error
	dbLog := "SQLSTATE[HY000] [1045] Access denied for user 'wp_user'@'localhost' (using password: YES)"
	invDb, err := svc.InvestigateLogs(ctx, site, dbLog)
	if err != nil {
		t.Fatalf("InvestigateLogs: %v", err)
	}
	if invDb.FixType != "fix_db_socket" {
		t.Errorf("expected fix_db_socket, got %q", invDb.FixType)
	}

	// 5. Read log file from disk
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "example.com.error.log")
	_ = os.WriteFile(logFile, []byte("PHP Warning: test warning line 1\nPHP Warning: test warning line 2\n"), 0o644)

	diskSvc := New(config.Config{LogDir: tmpDir, DryRun: true}, nil)
	invDisk, err := diskSvc.InvestigateLogs(ctx, site, "")
	if err != nil {
		t.Fatalf("InvestigateLogs disk: %v", err)
	}
	if invDisk.LinesRead != 2 {
		t.Errorf("expected 2 lines read from disk, got %d", invDisk.LinesRead)
	}
}
