package apps

import (
	"os"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestValidateName(t *testing.T) {
	valid := []string{"api", "web-app", "a1", "worker2", "API"}
	for _, name := range valid {
		if _, err := ValidateName(name); err != nil {
			t.Errorf("ValidateName(%q) = %v, want nil", name, err)
		}
	}
	invalid := []string{"", "-bad", "bad-", "has space", "under_score", "a/b", string(make([]byte, 40))}
	for _, name := range invalid {
		if _, err := ValidateName(name); err == nil {
			t.Errorf("ValidateName(%q) = nil, want error", name)
		}
	}
}

func TestValidateCommand(t *testing.T) {
	if _, err := ValidateCommand("npm start"); err != nil {
		t.Fatalf("simple command rejected: %v", err)
	}
	if _, err := ValidateCommand("gunicorn app:app --bind 0.0.0.0:8000"); err != nil {
		t.Fatalf("python command rejected: %v", err)
	}
	if _, err := ValidateCommand(""); err == nil {
		t.Fatal("empty command accepted")
	}
	if _, err := ValidateCommand("npm start\nrm -rf /"); err == nil {
		t.Fatal("multi-line command accepted")
	}
	if _, err := ValidateCommand("node \x00evil"); err == nil {
		t.Fatal("NUL byte accepted")
	}
}

func TestValidatePort(t *testing.T) {
	if _, err := ValidatePort(3000); err != nil {
		t.Fatalf("valid port rejected: %v", err)
	}
	for _, port := range []int{0, -1, 70000} {
		if _, err := ValidatePort(port); err == nil {
			t.Errorf("ValidatePort(%d) accepted", port)
		}
	}
}

func TestValidateEnv(t *testing.T) {
	env, err := ValidateEnv(map[string]string{"NODE_ENV": "production", "PORT": "3000"})
	if err != nil {
		t.Fatalf("valid env rejected: %v", err)
	}
	if env["NODE_ENV"] != "production" {
		t.Fatal("env value lost")
	}
	if _, err := ValidateEnv(map[string]string{"bad-key": "x"}); err == nil {
		t.Fatal("invalid env key accepted")
	}
	if _, err := ValidateEnv(map[string]string{"OK": "line1\nline2"}); err == nil {
		t.Fatal("multi-line env value accepted")
	}
}

func TestValidatePathStaysInWebroot(t *testing.T) {
	root := "/www/wwwroot/example.com"
	for _, in := range []string{"", ".", "app", "services/api"} {
		if _, err := ValidatePath(root, in); err != nil {
			t.Errorf("ValidatePath(%q) = %v, want nil", in, err)
		}
	}
	if _, err := ValidatePath(root, "/etc/passwd"); err == nil {
		t.Fatal("absolute path outside webroot accepted")
	}
	if _, err := ValidatePath(root, "../../etc"); err == nil {
		t.Fatal("traversal path accepted")
	}
}

func TestSupervisorNameNormalization(t *testing.T) {
	cases := map[string]string{
		"":            SupervisorSystemd,
		"systemd":     SupervisorSystemd,
		"pm2":         SupervisorPM2,
		"PM2":         SupervisorPM2,
		"supervisor":  SupervisorSupervisor,
		"supervisord": SupervisorSupervisor,
		"garbage":     SupervisorSystemd,
	}
	for in, want := range cases {
		if got := supervisorName(in); got != want {
			t.Errorf("supervisorName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUnitName(t *testing.T) {
	spec := Spec{Site: "example.com", Name: "api"}
	if got, want := unitName(spec), "clouddeck-app-example.com-api"; got != want {
		t.Fatalf("unitName = %q, want %q", got, want)
	}
}

func TestWriteSystemdUnitDirectives(t *testing.T) {
	tmp := t.TempDir()
	svc := &Service{
		cfg: config.Config{
			AppUnitDir: tmp,
			StateDir:   tmp,
		},
	}
	spec := Spec{
		Site:        "example.com",
		Name:        "api",
		Kind:        "nodejs",
		Command:     "node index.js",
		Dir:         tmp,
		Port:        3000,
		AutoRestart: true,
	}
	if err := svc.writeSystemdUnit(spec); err != nil {
		t.Fatalf("writeSystemdUnit: %v", err)
	}
	content, err := os.ReadFile(svc.unitPath(spec))
	if err != nil {
		t.Fatalf("read unit file: %v", err)
	}
	text := string(content)
	for _, expected := range []string{
		"StartLimitIntervalSec=60",
		"StartLimitBurst=5",
		"NoNewPrivileges=true",
		"Environment=\"PORT=3000\"",
	} {
		if !strings.Contains(text, expected) {
			t.Errorf("unit file missing %q:\n%s", expected, text)
		}
	}
}
