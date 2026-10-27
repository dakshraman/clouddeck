package processinfo

import (
	"os"
	"os/exec"
	"strconv"
	"testing"

	"clouddeck/agent/internal/apierr"
)

func TestCanKillProtections(t *testing.T) {
	if canKill(os.Getpid(), "0", true) {
		t.Error("agent process must not be killable")
	}
	if canKill(1, "0", true) {
		t.Error("PID 1 must not be killable")
	}
	if canKill(2, "0", false) {
		t.Error("kernel threads/zombies must not be killable")
	}
	if canKill(3, "", true) {
		t.Error("a process without a uid must not be killable")
	}
	if !canKill(424242, strconv.Itoa(os.Geteuid()), true) {
		t.Error("a same-user process should be killable")
	}
}

func TestKillRejectsProtected(t *testing.T) {
	for _, pid := range []int{os.Getpid(), 1} {
		err := Kill(pid)
		if err == nil {
			t.Fatalf("Kill(%d) succeeded, want refusal", pid)
		}
		apiErr, ok := apierr.As(err)
		if !ok || apiErr.Status != 403 {
			t.Errorf("Kill(%d) = %v, want 403 apierr", pid, err)
		}
	}
}

func TestKillUnknownPID(t *testing.T) {
	err := Kill(1 << 23)
	apiErr, ok := apierr.As(err)
	if !ok || apiErr.Code != "process_not_found" {
		t.Fatalf("Kill(unknown) = %v, want process_not_found", err)
	}
}

func TestKillTerminatesProcess(t *testing.T) {
	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Skipf("start sleep: %v", err)
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	if err := Kill(cmd.Process.Pid); err != nil {
		t.Fatalf("Kill: %v", err)
	}
	if err := cmd.Wait(); err == nil {
		t.Fatal("sleep exited normally, want signal")
	}
}
