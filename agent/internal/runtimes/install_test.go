package runtimes

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/tasks"
)

func newInstaller(t *testing.T, cfg config.Config) (*Installer, string) {
	t.Helper()
	dir := t.TempDir()
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return NewInstaller(cfg, auditLog), dir
}

// writeFakeInstaller writes an executable stub that appends its argv to a
// marker file and exits 0; it stands in for AGENT_*_INSTALL_CMD.
func writeFakeInstaller(t *testing.T) (bin, marker string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake installer script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	marker = filepath.Join(dir, "ran.txt")
	script := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + marker + "'\n"
	bin = filepath.Join(dir, "fake-install")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin, marker
}

func TestInstallValidatesInput(t *testing.T) {
	inst, _ := newInstaller(t, config.Config{})
	log := tasks.LogFunc(func(level, message string) {})

	assertInstallErr(t, inst.Install(context.Background(), log, "python", "3.12"), 400, "invalid_kind")
	assertInstallErr(t, inst.Install(context.Background(), log, KindNode, "abc"), 400, "invalid_version")
	assertInstallErr(t, inst.Install(context.Background(), log, KindPHP, "8"), 400, "invalid_version")
}

func TestInstallDryRun(t *testing.T) {
	bin, marker := writeFakeInstaller(t)
	inst, _ := newInstaller(t, config.Config{DryRun: true, NodeInstallCmd: bin})
	log := tasks.LogFunc(func(level, message string) {})

	assertInstallErr(t, inst.Install(context.Background(), log, KindNode, "22"), 409, "dry_run")
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("installer ran in dry-run mode")
	}
}

func TestInstallNodeOverrideCommand(t *testing.T) {
	bin, marker := writeFakeInstaller(t)
	inst, auditDir := newInstaller(t, config.Config{NodeInstallCmd: bin})
	log := tasks.LogFunc(func(level, message string) {})

	if err := inst.Install(context.Background(), log, KindNode, "22"); err != nil {
		t.Fatalf("Install node: %v", err)
	}
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "22") {
		t.Fatalf("installer argv = %q, want the version as last argument", data)
	}
	raw, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "runtime.install") {
		t.Fatalf("audit log missing the install record: %s", raw)
	}
}

func TestInstallPHPOverrideCommand(t *testing.T) {
	bin, marker := writeFakeInstaller(t)
	inst, _ := newInstaller(t, config.Config{PHPInstallCmd: bin})
	log := tasks.LogFunc(func(level, message string) {})

	if err := inst.Install(context.Background(), log, KindPHP, "8.2"); err != nil {
		t.Fatalf("Install php: %v", err)
	}
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "8.2") {
		t.Fatalf("installer argv = %q, want the version as last argument", data)
	}
}

func TestInstallableCatalog(t *testing.T) {
	catalog := Installable()
	if !slicesContains(catalog[KindNode], "22") || !slicesContains(catalog[KindPHP], "8.2") {
		t.Fatalf("installable catalog incomplete: %+v", catalog)
	}
}

func TestUninstallValidatesInput(t *testing.T) {
	inst, _ := newInstaller(t, config.Config{})
	log := tasks.LogFunc(func(level, message string) {})

	assertInstallErr(t, inst.Uninstall(context.Background(), log, "python", "3.12"), 400, "invalid_kind")
	assertInstallErr(t, inst.Uninstall(context.Background(), log, KindNode, "abc"), 400, "invalid_version")
	assertInstallErr(t, inst.Uninstall(context.Background(), log, KindPHP, "8"), 400, "invalid_version")
}

func TestUninstallNotInstalled(t *testing.T) {
	inst, _ := newInstaller(t, config.Config{PHPBase: t.TempDir()})
	log := tasks.LogFunc(func(level, message string) {})

	assertInstallErr(t, inst.Uninstall(context.Background(), log, KindPHP, "9.9"), 404, "not_installed")
}

func TestUninstallDryRun(t *testing.T) {
	base := t.TempDir()
	if err := os.Mkdir(filepath.Join(base, "8.2"), 0o755); err != nil {
		t.Fatal(err)
	}
	bin, marker := writeFakeInstaller(t)
	inst, _ := newInstaller(t, config.Config{DryRun: true, PHPBase: base, PHPUninstallCmd: bin})
	log := tasks.LogFunc(func(level, message string) {})

	assertInstallErr(t, inst.Uninstall(context.Background(), log, KindPHP, "8.2"), 409, "dry_run")
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("uninstaller ran in dry-run mode")
	}
}

func TestUninstallPHPOverrideCommand(t *testing.T) {
	base := t.TempDir()
	if err := os.Mkdir(filepath.Join(base, "8.2"), 0o755); err != nil {
		t.Fatal(err)
	}
	bin, marker := writeFakeInstaller(t)
	inst, auditDir := newInstaller(t, config.Config{PHPBase: base, PHPUninstallCmd: bin})
	log := tasks.LogFunc(func(level, message string) {})

	if err := inst.Uninstall(context.Background(), log, KindPHP, "8.2"); err != nil {
		t.Fatalf("Uninstall php: %v", err)
	}
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "8.2") {
		t.Fatalf("uninstaller argv = %q, want the version as last argument", data)
	}
	raw, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "runtime.uninstall") {
		t.Fatalf("audit log missing the uninstall record: %s", raw)
	}
}

func assertInstallErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s, want %d/%s (message %q)", apiErr.Status, apiErr.Code, status, code, apiErr.Message)
	}
}

func slicesContains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}
