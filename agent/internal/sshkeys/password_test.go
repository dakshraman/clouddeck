package sshkeys

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
)

// writeFakeChpasswd writes an executable stub that appends its stdin line to
// a marker file (and exits 1 with stderr when fail is set).
func writeFakeChpasswd(t *testing.T, fail bool) (bin, marker string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake chpasswd script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	marker = filepath.Join(dir, "ran.txt")
	script := "#!/bin/sh\nread line\nprintf '%s\\n' \"$line\" >> '" + marker + "'\n"
	if fail {
		script += "echo baduser: password mismatch >&2\nexit 1\n"
	}
	bin = filepath.Join(dir, "fake-chpasswd")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake command: %v", err)
	}
	return bin, marker
}

func waitForMarker(t *testing.T, marker string) string {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		data, err := os.ReadFile(marker)
		if err == nil {
			return string(data)
		}
		if time.Now().After(deadline) {
			t.Fatal("chpasswd helper never ran")
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func TestSetPasswordRunsHelperAndAudits(t *testing.T) {
	bin, marker := writeFakeChpasswd(t, false)
	svc, _, stateDir := newTestService(t, func(c *config.Config) { c.ChpasswdBin = bin })
	if err := svc.SetPassword("deploy", "Sup3rSecret!"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	if data := waitForMarker(t, marker); !strings.Contains(data, "deploy:Sup3rSecret!") {
		t.Fatalf("helper stdin = %q", data)
	}
	line := readAuditLog(t, stateDir)
	if !strings.Contains(line, "ssh.password.change") || !strings.Contains(line, `"user":"deploy"`) {
		t.Fatalf("audit log missing the change record: %s", line)
	}
	if strings.Contains(line, "Sup3rSecret") {
		t.Fatalf("audit log must never contain the password: %s", line)
	}
}

func TestSetPasswordDryRun(t *testing.T) {
	bin, marker := writeFakeChpasswd(t, false)
	svc, _, _ := newTestService(t, func(c *config.Config) { c.ChpasswdBin = bin; c.DryRun = true })
	wantAPIError(t, svc.SetPassword("deploy", "Sup3rSecret!"), 409, "dry_run")
	if _, err := os.Stat(marker); err == nil {
		t.Fatalf("helper ran in dry-run mode")
	}
}

func TestSetPasswordValidation(t *testing.T) {
	bin, marker := writeFakeChpasswd(t, false)
	svc, _, _ := newTestService(t, func(c *config.Config) { c.ChpasswdBin = bin })
	wantAPIError(t, svc.SetPassword("bad user!", "Sup3rSecret!"), 400, "invalid_username")
	wantAPIError(t, svc.SetPassword("deploy", "short"), 400, "invalid_password")
	if _, err := os.Stat(marker); err == nil {
		t.Fatalf("helper ran for rejected input")
	}
}

func TestSetPasswordHelperFails(t *testing.T) {
	bin, _ := writeFakeChpasswd(t, true)
	svc, _, _ := newTestService(t, func(c *config.Config) { c.ChpasswdBin = bin })
	wantAPIError(t, svc.SetPassword("deploy", "Sup3rSecret!"), 502, "password_change_failed")
}

func TestSetPasswordMissingBinary(t *testing.T) {
	svc, _, _ := newTestService(t, func(c *config.Config) { c.ChpasswdBin = "/definitely/not/here/chpasswd" })
	wantAPIError(t, svc.SetPassword("deploy", "Sup3rSecret!"), 502, "password_change_failed")
}
