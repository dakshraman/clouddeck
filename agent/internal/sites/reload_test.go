package sites

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/tasks"
)

// writeReloadShims replaces systemctl and nginx on PATH with shims that
// reproduce controlled reload failures: systemdFailure and nginxFailure are
// "" (success), "not-active"/"no-pid" (the two not-running signals) or "other"
// (an unrelated failure). Every invocation is appended to a marker file;
// startFails makes `systemctl start nginx` and the restart fallback exit 1.
func writeReloadShims(t *testing.T, systemdFailure, nginxFailure string, startFails bool) string {
	t.Helper()
	dir := t.TempDir()
	marker := filepath.Join(dir, "invocations.txt")

	systemctl := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + marker + "\n"
	switch systemdFailure {
	case "not-active":
		systemctl += "if [ \"$1\" = reload ]; then echo 'nginx.service is not active, cannot reload.' >&2; exit 1; fi\n"
	case "other":
		systemctl += "if [ \"$1\" = reload ]; then echo 'some other failure' >&2; exit 1; fi\n"
	}
	if startFails {
		systemctl += "if [ \"$1\" = start ] || [ \"$1\" = restart ]; then echo 'start failed' >&2; exit 1; fi\n"
	}
	if err := os.WriteFile(filepath.Join(dir, "systemctl"), []byte(systemctl), 0o755); err != nil {
		t.Fatal(err)
	}

	nginx := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + marker + "\n"
	switch nginxFailure {
	case "no-pid":
		nginx += "if [ \"$1\" = -s ]; then echo 'invalid PID number \"\" in \"/run/nginx.pid\"' >&2; exit 1; fi\n"
	case "other":
		nginx += "if [ \"$1\" = -s ]; then echo 'signal process error' >&2; exit 1; fi\n"
	}
	if err := os.WriteFile(filepath.Join(dir, "nginx"), []byte(nginx), 0o755); err != nil {
		t.Fatal(err)
	}

	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
	return marker
}

func TestReloadStartsNginxWhenNotRunning(t *testing.T) {
	marker := writeReloadShims(t, "not-active", "no-pid", false)
	s := &Service{cfg: config.Config{}}
	log := tasks.LogFunc(func(level, message string) {})

	if err := s.reload(context.Background(), log); err != nil {
		t.Fatalf("reload with nginx stopped should start it, got: %v", err)
	}
	invocations, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(invocations), "start nginx") {
		t.Fatalf("expected a `systemctl start nginx` attempt, got: %s", invocations)
	}
}

func TestReloadStartFailureSurfacesOriginalError(t *testing.T) {
	writeReloadShims(t, "not-active", "no-pid", true)
	s := &Service{cfg: config.Config{}}
	log := tasks.LogFunc(func(level, message string) {})

	err := s.reload(context.Background(), log)
	if err == nil {
		t.Fatal("reload should fail when both reload and start fail")
	}
	if !strings.Contains(err.Error(), "reload nginx") {
		t.Fatalf("error should carry the reload failure: %v", err)
	}
}

func TestReloadUnknownFailureDoesNotStart(t *testing.T) {
	marker := writeReloadShims(t, "other", "other", false)
	s := &Service{cfg: config.Config{}}
	log := tasks.LogFunc(func(level, message string) {})

	if err := s.reload(context.Background(), log); err == nil {
		t.Fatal("unknown reload failures should still fail the operation")
	}
	invocations, err := os.ReadFile(marker)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(invocations), "start nginx") {
		t.Fatalf("start must only run when nginx is known to be down: %s", invocations)
	}
}
