// Package audit appends one JSON line per mutation decision to audit.log.
package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Results recorded in the audit trail.
const (
	ResultAccepted = "accepted"
	ResultRejected = "rejected"
)

// Record is one audit log line.
type Record struct {
	TS     time.Time      `json:"ts"`
	Action string         `json:"action"`
	Params map[string]any `json:"params"`
	Result string         `json:"result"`
	Error  string         `json:"error,omitempty"`
}

// Log is an append-only JSONL audit trail.
type Log struct {
	mu   sync.Mutex
	path string
}

// Open prepares the audit log inside stateDir.
func Open(stateDir string) (*Log, error) {
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return nil, fmt.Errorf("create state dir: %w", err)
	}
	return &Log{path: filepath.Join(stateDir, "audit.log")}, nil
}

// Append writes one record. It is safe for concurrent use.
func (l *Log) Append(rec Record) error {
	if rec.TS.IsZero() {
		rec.TS = time.Now().UTC().Truncate(time.Second)
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("encode audit record: %w", err)
	}
	data = append(data, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()
	f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open audit log: %w", err)
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write audit log: %w", err)
	}
	if err := f.Sync(); err != nil {
		return fmt.Errorf("sync audit log: %w", err)
	}
	return nil
}
