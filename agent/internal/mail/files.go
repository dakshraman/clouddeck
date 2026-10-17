package mail

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// writeFileAtomic replaces path with data through a temporary file in the
// same directory followed by a rename, so readers never observe a partial
// file. The parent directory is created when missing and the result gets
// mode.
func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file in %s: %w", dir, err)
	}
	tmpName := tmp.Name()
	cleanup := func() { tmp.Close(); os.Remove(tmpName) }

	if _, err := tmp.Write(data); err != nil {
		cleanup()
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("sync %s: %w", path, err)
	}
	if err := tmp.Chmod(mode); err != nil {
		cleanup()
		return fmt.Errorf("chmod %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("close %s: %w", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}

// readLines reads path as text lines. A missing file is not an error (it
// reads as empty). Line endings keep their content but lose a trailing \r,
// and trailing empty lines are dropped.
func readLines(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], "\r")
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines, nil
}

// joinLines renders lines as file content with a trailing newline. An empty
// slice renders as an empty file.
func joinLines(lines []string) []byte {
	if len(lines) == 0 {
		return nil
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

// modTime returns path's modification time in UTC, or the zero time when the
// file cannot be stat'ed. The frozen file layouts carry no per-entry
// timestamps, so createdAt values are derived from the on-disk files.
func modTime(path string) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime().UTC()
}

// dirBytes sums the sizes of every regular file under root. A missing or
// unreadable tree counts as zero bytes; symlinks are not followed.
func dirBytes(root string) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries; the size stays best-effort
		}
		if entry.Type().IsRegular() {
			if info, infoErr := entry.Info(); infoErr == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total
}
