//go:build linux

package term

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"unsafe"
)

// Linux ioctl requests used to allocate and configure a PTY. The values are
// the standard x86-64/arm64 "asm-generic" encodings.
const (
	ioctlTIOCSPTLCK = 0x40045431 // unlockpt: int32 0
	ioctlTIOCGPTN   = 0x80045430 // ptsname: uint32 N
	ioctlTIOCSWINSZ = 0x5414     // set window size
)

// winsize mirrors struct winsize from <termios.h>.
type winsize struct {
	Row    uint16
	Col    uint16
	Xpixel uint16
	Ypixel uint16
}

// openPTY allocates a pseudo-terminal pair: /dev/ptmx is unlocked, its pts
// number read back with TIOCGPTN, and the matching /dev/pts/N opened as the
// slave. The caller closes the slave once the child has inherited it.
func openPTY() (*os.File, *os.File, error) {
	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		return nil, nil, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	var unlock int32
	if err := ioctl(master.Fd(), ioctlTIOCSPTLCK, unsafe.Pointer(&unlock)); err != nil {
		master.Close()
		return nil, nil, fmt.Errorf("unlock pty: %w", err)
	}

	var ptn uint32
	if err := ioctl(master.Fd(), ioctlTIOCGPTN, unsafe.Pointer(&ptn)); err != nil {
		master.Close()
		return nil, nil, fmt.Errorf("pty number: %w", err)
	}

	slavePath := fmt.Sprintf("/dev/pts/%d", ptn)
	slave, err := os.OpenFile(slavePath, os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		master.Close()
		return nil, nil, fmt.Errorf("open %s: %w", slavePath, err)
	}
	return master, slave, nil
}

// setWinsize applies cols x rows to the terminal behind fd.
func setWinsize(fd uintptr, cols, rows int) error {
	ws := winsize{Row: uint16(rows), Col: uint16(cols)}
	return ioctl(fd, ioctlTIOCSWINSZ, unsafe.Pointer(&ws))
}

// ioctl performs one SYS_IOCTL call with arg as the (often struct) request
// argument.
func ioctl(fd, req uintptr, arg unsafe.Pointer) error {
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, fd, req, uintptr(arg)); errno != 0 {
		return errno
	}
	return nil
}

// termSysProcAttr puts the shell in its own session with the PTY slave
// (fd 0) as its controlling terminal, optionally dropping to another user.
func termSysProcAttr(uid, gid int, switchUser bool) *syscall.SysProcAttr {
	attr := &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    0,
	}
	if switchUser {
		attr.Credential = &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid)}
	}
	return attr
}

// killProcess SIGKILLs the shell's whole process group: Setsid made the
// shell the group leader, so helpers it spawned release the PTY as well.
func killProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil {
		_ = cmd.Process.Kill()
	}
}
