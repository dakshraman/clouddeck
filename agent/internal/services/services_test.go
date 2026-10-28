package services

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// newTestManager wires a manager whose audit log lives in a temp dir.
func newTestManager(t *testing.T, cfg config.Config) (*Manager, string) {
	t.Helper()
	auditDir := t.TempDir()
	auditLog, err := audit.Open(auditDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return New(cfg, auditLog), auditDir
}

// assertAPIErr asserts err is an *apierr.Error with the wanted status/code.
func assertAPIErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s, want %d/%s (message %q)", apiErr.Status, apiErr.Code, status, code, apiErr.Message)
	}
}

// writeFakeCommand writes an executable stub restart command that appends
// its argv to a marker file, copies stderrMsg to stderr and exits with
// exitCode. Tests use it to exercise argv handling and error mapping
// without real services.
func writeFakeCommand(t *testing.T, stderrMsg string, exitCode int) (bin, marker string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake restart command script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	marker = filepath.Join(dir, "ran.txt")
	errFile := filepath.Join(dir, "stderr.txt")
	if err := os.WriteFile(errFile, []byte(stderrMsg), 0o644); err != nil {
		t.Fatalf("write stderr file: %v", err)
	}
	script := "#!/bin/sh\n" +
		"printf '%s\\n' \"$@\" > " + shQuote(marker) + "\n" +
		"if [ -s " + shQuote(errFile) + " ]; then cat " + shQuote(errFile) + " >&2; fi\n" +
		fmt.Sprintf("exit %d\n", exitCode)
	bin = filepath.Join(dir, "fake-restart")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake command: %v", err)
	}
	return bin, marker
}

// shQuote wraps s in single quotes for POSIX sh.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func TestListProbesAllServices(t *testing.T) {
	mgr, _ := newTestManager(t, config.Config{})
	statuses := mgr.List(context.Background())
	if len(statuses) != 3 {
		t.Fatalf("List returned %d statuses, want 3: %+v", len(statuses), statuses)
	}
	want := []struct{ name, label string }{
		{NameNginx, "Nginx (web server)"},
		{NameMySQL, "MySQL/MariaDB (database)"},
		{NamePHPFpm, "PHP-FPM (application server)"},
	}
	for i, w := range want {
		st := statuses[i]
		if st.Name != w.name || st.Label != w.label {
			t.Errorf("statuses[%d] = %q/%q, want %q/%q", i, st.Name, st.Label, w.name, w.label)
		}
		switch st.State {
		case StateRunning:
			if st.PID <= 0 {
				t.Errorf("%s is running without a PID: %+v", st.Name, st)
			}
		case StateStopped, StateUnknown:
		default:
			t.Errorf("%s state = %q, want running|stopped|unknown", st.Name, st.State)
		}
	}
}

func TestRestartUnknownService(t *testing.T) {
	bin, marker := writeFakeCommand(t, "", 0)
	for _, name := range []string{"postgres", "Nginx", "", "nginx "} {
		mgr, _ := newTestManager(t, config.Config{NginxRestartCmd: bin})
		_, err := mgr.Restart(context.Background(), name)
		assertAPIErr(t, err, 404, "unknown_service")
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatalf("restart command ran for an unknown service")
	}
}

func TestRestartUnknownServiceBeatsDryRun(t *testing.T) {
	mgr, _ := newTestManager(t, config.Config{DryRun: true})
	_, err := mgr.Restart(context.Background(), "postgres")
	assertAPIErr(t, err, 404, "unknown_service")
}

func TestRestartDryRun(t *testing.T) {
	bin, marker := writeFakeCommand(t, "", 0)
	mgr, _ := newTestManager(t, config.Config{NginxRestartCmd: bin, DryRun: true})
	_, err := mgr.Restart(context.Background(), NameNginx)
	assertAPIErr(t, err, 409, "dry_run")
	if _, err := os.Stat(marker); err == nil {
		t.Fatalf("restart command ran in dry-run mode")
	}
}

// Unconfigured restarts default to systemctl; without a systemctl binary on
// PATH (empty PATH) the restart fails closed with 502 instead of 412.
func TestRestartNotConfigured(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PATH manipulation requires a POSIX shell")
	}
	dir := t.TempDir()
	t.Setenv("PATH", dir)
	for _, name := range []string{NameNginx, NameMySQL, NamePHPFpm} {
		t.Run(name, func(t *testing.T) {
			mgr, _ := newTestManager(t, config.Config{})
			_, err := mgr.Restart(context.Background(), name)
			assertAPIErr(t, err, 502, "service_restart_failed")
		})
	}
}

func TestRestartUsesPerServiceCommand(t *testing.T) {
	tests := []struct {
		name  string
		label string
		set   func(*config.Config, string)
	}{
		{NameNginx, "Nginx (web server)", func(cfg *config.Config, cmd string) { cfg.NginxRestartCmd = cmd }},
		{NameMySQL, "MySQL/MariaDB (database)", func(cfg *config.Config, cmd string) { cfg.MySQLRestartCmd = cmd }},
		{NamePHPFpm, "PHP-FPM (application server)", func(cfg *config.Config, cmd string) { cfg.PHPFpmRestartCmd = cmd }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bin, marker := writeFakeCommand(t, "", 0)
			var cfg config.Config
			tt.set(&cfg, bin)
			mgr, _ := newTestManager(t, cfg)
			st, err := mgr.Restart(context.Background(), tt.name)
			if err != nil {
				t.Fatalf("Restart(%s): %v", tt.name, err)
			}
			if st.Name != tt.name || st.Label != tt.label {
				t.Fatalf("status = %q/%q, want %q/%q", st.Name, st.Label, tt.name, tt.label)
			}
			if _, err := os.Stat(marker); err != nil {
				t.Fatalf("restart command did not run: %v", err)
			}
		})
	}
}

func TestRestartSplitsCommandIntoArgv(t *testing.T) {
	bin, marker := writeFakeCommand(t, "", 0)
	mgr, _ := newTestManager(t, config.Config{NginxRestartCmd: bin + " --force restart"})
	if _, err := mgr.Restart(context.Background(), NameNginx); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	argv, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("read marker: %v", err)
	}
	if got, want := string(argv), "--force\nrestart\n"; got != want {
		t.Fatalf("command argv = %q, want %q", got, want)
	}
}

func TestRestartFailureMapsTo502(t *testing.T) {
	bin, _ := writeFakeCommand(t, "job for nginx.service failed: unit not found", 1)
	mgr, _ := newTestManager(t, config.Config{NginxRestartCmd: bin})
	_, err := mgr.Restart(context.Background(), NameNginx)
	assertAPIErr(t, err, 502, "service_restart_failed")
	apiErr, _ := apierr.As(err)
	if !strings.Contains(apiErr.Message, "unit not found") {
		t.Fatalf("error message %q does not carry the stderr tail", apiErr.Message)
	}
}

func TestRestartMissingBinaryMapsTo502(t *testing.T) {
	mgr, _ := newTestManager(t, config.Config{NginxRestartCmd: filepath.Join(t.TempDir(), "clouddeck-no-such-restart")})
	_, err := mgr.Restart(context.Background(), NameNginx)
	assertAPIErr(t, err, 502, "service_restart_failed")
}

func TestRestartAuditsAcceptedAction(t *testing.T) {
	bin, _ := writeFakeCommand(t, "", 0)
	mgr, auditDir := newTestManager(t, config.Config{NginxRestartCmd: bin})
	if _, err := mgr.Restart(context.Background(), NameNginx); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	for _, want := range []string{`"action":"service.restart"`, `"result":"accepted"`, `"name":"nginx"`} {
		if !strings.Contains(string(data), want) {
			t.Errorf("audit log missing %s: %s", want, data)
		}
	}
}

func TestProbeStoppedWhenNoProcessMatches(t *testing.T) {
	if _, err := exec.LookPath("pgrep"); err != nil {
		t.Skip("pgrep not installed")
	}
	spec := probeSpec{name: "x", label: "X", matchArgs: [][]string{{"-x", "clouddeck-nosuchproc"}}}
	if got := probe(context.Background(), spec); got.State != StateStopped || got.PID != 0 {
		t.Fatalf("probe = %+v, want stopped without PID", got)
	}
}

func TestProbeUnknownWhenPgrepMissing(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	got := probe(context.Background(), specs[0])
	if got.State != StateUnknown {
		t.Fatalf("state = %q, want unknown", got.State)
	}
	if got.Details != "pgrep is not installed" {
		t.Fatalf("details = %q, want %q", got.Details, "pgrep is not installed")
	}
}

func TestVersionParsing(t *testing.T) {
	nginx := []struct{ in, want string }{
		{"nginx version: nginx/1.24.0 (Ubuntu)", "1.24.0"},
		{"nginx version: nginx/1.18.0", "1.18.0"},
		{"", ""},
		{"unexpected output", ""},
	}
	for _, tt := range nginx {
		if got := nginxVersion(tt.in); got != tt.want {
			t.Errorf("nginxVersion(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}

	mysql := []struct{ in, want string }{
		{"mysqld  Ver 8.0.36-0ubuntu0.22.04.1 for Linux on x86_64 ((Ubuntu))", "8.0.36-0ubuntu0.22.04.1"},
		{"mariadbd  Ver 10.6.16-MariaDB-0ubuntu0.22.04.1 for debian-linux-gnu on x86_64", "10.6.16-MariaDB-0ubuntu0.22.04.1"},
		{"no version here", ""},
	}
	for _, tt := range mysql {
		if got := mysqlVersion(tt.in); got != tt.want {
			t.Errorf("mysqlVersion(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}

	php := []struct{ in, want string }{
		{"PHP 8.3.6 (fpm-fcgi) (built: Apr 11 2024 20:11:54)", "8.3.6"},
		{"PHP 7.4.33 (fpm-fcgi)", "7.4.33"},
		{"", ""},
	}
	for _, tt := range php {
		if got := phpVersion(tt.in); got != tt.want {
			t.Errorf("phpVersion(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestTailText(t *testing.T) {
	if got := tailText(""); got != "" {
		t.Errorf("tailText(\"\") = %q, want empty", got)
	}
	if got := tailText("job failed:\nsome\tdetail"); got != "job failed: some detail" {
		t.Errorf("tailText collapsed = %q, want single line", got)
	}

	long := "START" + strings.Repeat("x", 350) + "END"
	got := tailText(long)
	if len([]rune(got)) != stderrTailRunes+3 {
		t.Errorf("len(tailText(long)) = %d runes, want %d", len([]rune(got)), stderrTailRunes+3)
	}
	if !strings.HasPrefix(got, "...") {
		t.Errorf("tailText(long) = %q, want leading ellipsis marking truncation", got[:10])
	}
	if !strings.HasSuffix(got, "END") {
		t.Errorf("tailText(long) does not keep the end of stderr: %q", got[len(got)-10:])
	}
}
