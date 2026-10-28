package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
)

// writeSystemctlShim replaces systemctl on PATH with a stub that appends its
// argv to a marker file. Behaviour is driven by the returned script body:
// list-unit-files prints unitList; `restart mysql` can fail so the MariaDB
// retry path is exercised.
func writeSystemctlShim(t *testing.T, unitList string, mysqlFails bool) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("systemctl shim requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	marker := filepath.Join(dir, "invocations.txt")

	script := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + shQuote(marker) + "\n"
	if unitList != "" {
		script += "if [ \"$1\" = list-unit-files ]; then printf '%s\\n' " + shQuote(unitList) + "; exit 0; fi\n"
	}
	if mysqlFails {
		script += "if [ \"$2\" = mysql ]; then echo 'Failed to restart mysql.service: Unit mysql.service not found.' >&2; exit 1; fi\n"
	}
	script += "exit 0\n"
	if err := os.WriteFile(filepath.Join(dir, "systemctl"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	return marker
}

func TestRestartDefaultsToSystemctlWhenUnconfigured(t *testing.T) {
	marker := writeSystemctlShim(t, "", false)
	mgr, _ := newTestManager(t, config.Config{})

	status, err := mgr.Restart(context.Background(), NameNginx)
	if err != nil {
		t.Fatalf("Restart with no configured command should default to systemctl: %v", err)
	}
	if status.Name != NameNginx {
		t.Fatalf("status name = %q", status.Name)
	}
	invocations, readErr := os.ReadFile(marker)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !strings.Contains(string(invocations), "restart nginx") {
		t.Fatalf("expected `systemctl restart nginx`, got: %s", invocations)
	}
}

func TestRestartPHPFpmPicksVersionedUnit(t *testing.T) {
	marker := writeSystemctlShim(t, "php8.3-fpm.service auto enabled", false)
	mgr, _ := newTestManager(t, config.Config{})

	if _, err := mgr.Restart(context.Background(), NamePHPFpm); err != nil {
		t.Fatalf("Restart php-fpm: %v", err)
	}
	invocations, readErr := os.ReadFile(marker)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !strings.Contains(string(invocations), "restart php8.3-fpm") {
		t.Fatalf("expected the versioned php unit, got: %s", invocations)
	}
}

func TestRestartMySQLRetriesMariadbUnit(t *testing.T) {
	marker := writeSystemctlShim(t, "", true)
	mgr, _ := newTestManager(t, config.Config{})

	if _, err := mgr.Restart(context.Background(), NameMySQL); err != nil {
		t.Fatalf("Restart mysql should retry with the mariadb unit: %v", err)
	}
	invocations, readErr := os.ReadFile(marker)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !strings.Contains(string(invocations), "restart mariadb") {
		t.Fatalf("expected a mariadb retry, got: %s", invocations)
	}
}

func TestRestartUnconfiguredWithoutSystemctl(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PATH manipulation requires a POSIX shell")
	}
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	mgr, _ := newTestManager(t, config.Config{})

	_, err := mgr.Restart(context.Background(), NameNginx)
	assertAPIErr(t, err, 502, "service_restart_failed")
}
