//go:build !linux

package systeminfo

// diskStats is a stub for platforms without syscall.Statfs, such as the
// Windows development host: the API reports zeros plus a note.
func diskStats() (total, used uint64, ok bool) {
	return 0, 0, false
}
