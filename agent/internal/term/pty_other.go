//go:build !linux

package term

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// errUnsupported is returned by every PTY operation off Linux. The service
// still compiles on the Windows development host so the rest of the agent
// builds; sessions fail cleanly at Start.
var errUnsupported = errors.New("term: unsupported platform")

// openPTY is unavailable off Linux.
func openPTY() (*os.File, *os.File, error) {
	return nil, nil, errUnsupported
}

// setWinsize is unavailable off Linux.
func setWinsize(fd uintptr, cols, rows int) error {
	return errUnsupported
}

// termSysProcAttr has no session/controlling-terminal knobs to set here.
func termSysProcAttr(uid, gid int, switchUser bool) *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}

// killProcess falls back to killing just the shell process.
func killProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}
