package processinfo

import (
	"errors"
	"fmt"
	"os"
	"syscall"
	"time"

	"clouddeck/agent/internal/apierr"
)

// Kill terminates pid with SIGTERM, escalating to SIGKILL when it has not
// exited after killGrace. The pid is validated again so a stale list row or a
// hand-written request cannot signal a protected process.
func Kill(pid int) error {
	if err := checkKillable(pid); err != nil {
		return err
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		return killError(pid, err)
	}
	deadline := time.Now().Add(killGrace)
	for time.Now().Before(deadline) {
		if processGone(pid) {
			return nil
		}
		time.Sleep(killPoll)
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		return killError(pid, err)
	}
	return nil
}

// processGone treats zombies as gone: they are already dead and only wait for
// their parent to reap them, so escalating to SIGKILL would be pointless.
func processGone(pid int) bool {
	if syscall.Kill(pid, 0) != nil {
		return true // ESRCH (gone) or EPERM (no longer signalable)
	}
	stat, err := readStat(pid)
	return err != nil || stat.state == 'Z' || stat.state == 'X'
}

const (
	killGrace = 2 * time.Second
	killPoll  = 100 * time.Millisecond
)

func checkKillable(pid int) error {
	status, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return apierr.NotFound("process_not_found", fmt.Sprintf("process %d is not running", pid))
	}
	uid, _ := parseStatus(status)
	cmdline, _ := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	// An empty cmdline means a kernel thread or zombie; neither can be killed.
	hasCmdline := len(cmdline) > 0
	if !canKill(pid, uid, hasCmdline) {
		return apierr.New(403, "process_protected", fmt.Sprintf("process %d is protected or owned by another user", pid))
	}
	return nil
}

func killError(pid int, err error) error {
	switch {
	case errors.Is(err, syscall.ESRCH):
		return apierr.NotFound("process_not_found", fmt.Sprintf("process %d is not running", pid))
	case errors.Is(err, syscall.EPERM):
		return apierr.New(403, "process_forbidden", fmt.Sprintf("not permitted to kill process %d", pid))
	default:
		return apierr.Internal(fmt.Sprintf("kill process %d: %v", pid, err))
	}
}
