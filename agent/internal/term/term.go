// Package term provides the web terminal: PTY-backed shell sessions whose
// output is streamed to the panel over Server-Sent Events. See docs/api.md
// section 1.10.
package term

import (
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Session describes one live shell session.
type Session struct {
	ID        string    `json:"id"`
	User      string    `json:"user"`
	Shell     string    `json:"shell"`
	Cols      int       `json:"cols"`
	Rows      int       `json:"rows"`
	StartedAt time.Time `json:"startedAt"`
}

// Event is one PTY output event. Exit is non-nil only on the final event and
// carries the process exit code.
type Event struct {
	Data []byte
	Exit *int
}

// Status is the /v1/term/status body.
type Status struct {
	Enabled  bool   `json:"enabled"`
	User     string `json:"user"`
	Shell    string `json:"shell"`
	Sessions int    `json:"sessions"`
}

// Service owns the live PTY sessions.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.Mutex
}

// New creates the terminal service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog}
}

// Start spawns a shell session and returns it.
func (s *Service) Start(cols, rows int) (Session, error) {
	return Session{}, apierr.Internal("term: not implemented")
}

// Attach returns the session's output backlog, a channel of subsequent
// events, and a cancel func that detaches this consumer (the shell keeps
// running). The events channel is closed when the session ends.
func (s *Service) Attach(id string) (backlog []byte, events <-chan Event, cancel func(), err error) {
	return nil, nil, func() {}, apierr.Internal("term: not implemented")
}

// Input writes raw bytes to the session's PTY.
func (s *Service) Input(id string, data []byte) error {
	return apierr.Internal("term: not implemented")
}

// Resize updates the session's PTY window size.
func (s *Service) Resize(id string, cols, rows int) error {
	return apierr.Internal("term: not implemented")
}

// Close terminates the session and its shell.
func (s *Service) Close(id string) error {
	return apierr.Internal("term: not implemented")
}

// Status reports the terminal configuration and live session count.
func (s *Service) Status() Status {
	return Status{Enabled: !s.cfg.DryRun, User: s.cfg.TermUser, Shell: s.cfg.TermShell}
}
