package systeminfo

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

// newTestAudit opens an audit log inside a temp dir.
func newTestAudit(t *testing.T) (*audit.Log, string) {
	t.Helper()
	dir := t.TempDir()
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return auditLog, dir
}

// writeFakeReboot writes an executable stub that appends to a marker file.
func writeFakeReboot(t *testing.T) (bin, marker string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake reboot script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	marker = filepath.Join(dir, "ran.txt")
	script := "#!/bin/sh\nprintf 'rebooted\\n' >> '" + marker + "'\n"
	bin = filepath.Join(dir, "fake-reboot")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake command: %v", err)
	}
	return bin, marker
}

// waitFor polls the marker file until the background reboot command runs.
func waitFor(t *testing.T, marker string) []byte {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		data, err := os.ReadFile(marker)
		if err == nil {
			return data
		}
		if time.Now().After(deadline) {
			t.Fatal("reboot command never ran")
		}
		time.Sleep(25 * time.Millisecond)
	}
}

// assertRebootErr asserts err is an *apierr.Error with the wanted status/code.
func assertRebootErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s, want %d/%s (message %q)", apiErr.Status, apiErr.Code, status, code, apiErr.Message)
	}
}

func TestRebootRunsCommandAndAudits(t *testing.T) {
	bin, marker := writeFakeReboot(t)
	auditLog, auditDir := newTestAudit(t)
	if err := Reboot(bin, auditLog); err != nil {
		t.Fatalf("Reboot: %v", err)
	}
	if data := waitFor(t, marker); !strings.Contains(string(data), "rebooted") {
		t.Fatalf("marker = %q", data)
	}
	raw, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	if !strings.Contains(string(raw), "system.reboot") {
		t.Fatalf("audit log missing system.reboot: %s", raw)
	}
}

func TestRebootNotConfigured(t *testing.T) {
	auditLog, _ := newTestAudit(t)
	assertRebootErr(t, Reboot("  ", auditLog), 412, "reboot_not_configured")
}

func TestRebootMissingBinary(t *testing.T) {
	auditLog, _ := newTestAudit(t)
	assertRebootErr(t, Reboot("/definitely/not/here/reboot", auditLog), 502, "reboot_failed")
}
