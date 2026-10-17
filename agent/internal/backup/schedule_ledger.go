// The schedule ledger is the pruning bookkeeping of the v0.4 scheduled
// backups (docs/api.md section 1.8). Only archives recorded here — archives
// produced by a scheduled run that succeeded — are ever pruned; manual
// backups never enter the ledger and are never touched.
package backup

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

// scheduleLedger tracks scheduled archive ids per source, newest first. The
// source key is "kind/source" (e.g. "site/example.com"), so a database that
// shares a name with a site cannot evict the site's archives.
type scheduleLedger struct {
	Sources map[string][]string `json:"sources"`
}

// newScheduleLedger returns an empty ledger.
func newScheduleLedger() *scheduleLedger {
	return &scheduleLedger{Sources: map[string][]string{}}
}

// ledgerKey is the per-source bookkeeping key of kind and source.
func ledgerKey(kind, source string) string { return kind + "/" + source }

// recordScheduledArchive records one successful scheduled archive (newest
// first) and prunes the source down to the newest keep scheduled archives.
// Ledger entries that are not regular files of this exact source are dropped
// from bookkeeping without being removed from disk.
func (s *Service) recordScheduledArchive(kind, source string, keep int, id string) error {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	led, err := s.loadLedgerLocked()
	if err != nil {
		return err
	}
	key := ledgerKey(kind, source)

	// Collect the scheduled archives of this source, newest first, dropping
	// duplicates and anything the ledger should never have held.
	ids := make([]string, 0, len(led.Sources[key])+1)
	seen := make(map[string]bool, len(led.Sources[key])+1)
	for _, candidate := range append([]string{id}, led.Sources[key]...) {
		parsed, ok := parseName(candidate)
		if !ok || parsed.kind != kind || parsed.source != source || seen[candidate] {
			continue
		}
		seen[candidate] = true
		ids = append(ids, candidate)
	}
	sort.Slice(ids, func(i, j int) bool {
		pi, _ := parseName(ids[i])
		pj, _ := parseName(ids[j])
		if !pi.at.Equal(pj.at) {
			return pi.at.After(pj.at)
		}
		return ids[i] > ids[j]
	})

	// Keep the newest keep archives that still exist; remove the rest. Files
	// that vanished and entries that are not regular files are forgotten.
	remaining := make([]string, 0, keep)
	var firstErr error
	for _, candidate := range ids {
		archivePath := filepath.Join(s.cfg.BackupDir, candidate)
		info, err := os.Lstat(archivePath)
		switch {
		case errors.Is(err, fs.ErrNotExist):
			continue
		case err != nil:
			firstErr = firstError(firstErr, fmt.Errorf("stat scheduled archive %s: %w", candidate, err))
			remaining = append(remaining, candidate)
			continue
		case !info.Mode().IsRegular():
			continue
		}
		if len(remaining) < keep {
			remaining = append(remaining, candidate)
			continue
		}
		if err := os.Remove(archivePath); err != nil && !errors.Is(err, fs.ErrNotExist) {
			firstErr = firstError(firstErr, fmt.Errorf("prune scheduled archive %s: %w", candidate, err))
			// Keep retrying this archive on the next run.
			remaining = append(remaining, candidate)
		}
	}

	if len(remaining) == 0 {
		delete(led.Sources, key)
	} else {
		led.Sources[key] = remaining
	}
	if err := s.saveLedgerLocked(led); err != nil {
		return firstError(firstErr, err)
	}
	return firstErr
}

// ledgerPath is the pruning ledger file in AGENT_STATE_DIR.
func (s *Service) ledgerPath() string { return filepath.Join(s.cfg.StateDir, ledgerFileName) }

// loadLedgerLocked reads the ledger; callers hold stateMu. A missing file
// yields an empty ledger.
func (s *Service) loadLedgerLocked() (*scheduleLedger, error) {
	data, err := os.ReadFile(s.ledgerPath())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return newScheduleLedger(), nil
		}
		return nil, fmt.Errorf("read schedule ledger: %w", err)
	}
	led := newScheduleLedger()
	if err := json.Unmarshal(data, led); err != nil {
		return nil, fmt.Errorf("parse schedule ledger: %w", err)
	}
	if led.Sources == nil {
		led.Sources = map[string][]string{}
	}
	return led, nil
}

// saveLedgerLocked persists the ledger atomically; callers hold stateMu.
func (s *Service) saveLedgerLocked(led *scheduleLedger) error {
	if err := os.MkdirAll(s.cfg.StateDir, 0o755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}
	if err := writeJSONAtomic(s.ledgerPath(), led, 0o600); err != nil {
		return fmt.Errorf("write schedule ledger: %w", err)
	}
	return nil
}

// firstError keeps the first of a chain of best-effort errors.
func firstError(current, next error) error {
	if current != nil {
		return current
	}
	return next
}
