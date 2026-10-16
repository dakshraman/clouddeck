//go:build linux

package systeminfo

import "syscall"

// diskStats reports totals for the root filesystem.
func diskStats() (total, used uint64, ok bool) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err != nil {
		return 0, 0, false
	}
	total = uint64(stat.Blocks) * uint64(stat.Bsize)
	free := uint64(stat.Bavail) * uint64(stat.Bsize)
	if free > total {
		free = total
	}
	return total, total - free, true
}
