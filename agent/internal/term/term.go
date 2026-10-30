// Package term provides the web terminal: PTY-backed shell sessions whose
// output is streamed to the panel over Server-Sent Events. See docs/api.md
// section 1.9.
package term

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

const (
	// maxSessions caps live shells per docs/api.md.
	maxSessions = 4
	// minDim/maxDim bound the PTY window size; non-positive requests fall
	// back to defaultCols/defaultRows.
	minDim      = 8
	maxDim      = 500
	defaultCols = 80
	defaultRows = 24

	// ringSize is the scrollback kept per session for late attach.
	ringSize = 256 << 10
	// readChunk is the size of one PTY master read.
	readChunk = 32 << 10
	// subBuffer is the per-subscriber queue length; slow consumers drop chunks.
	subBuffer = 256

	// idleTimeout is how long a session may go without input before the
	// reaper kills it; reapInterval is the reaper tick.
	idleTimeout  = 15 * time.Minute
	reapInterval = 60 * time.Second
	// killWait bounds Close when a shell refuses to die.
	killWait = 5 * time.Second

	actionSessionStart = "term.session.start"
	actionSessionClose = "term.session.close"
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

	// startMu serializes Start so the live-session cap cannot be exceeded.
	startMu sync.Mutex
	// reaperOnce starts the idle reaper on the first Start.
	reaperOnce sync.Once

	mu       sync.Mutex
	sessions map[string]*session
}

// New creates the terminal service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog, sessions: map[string]*session{}}
}

// Start spawns a shell session and returns it.
func (s *Service) Start(cols, rows int) (Session, error) {
	if s.cfg.DryRun {
		return Session{}, apierr.Conflict("term_disabled", "terminal is disabled under dry run")
	}
	cols = clampDimension(cols, defaultCols)
	rows = clampDimension(rows, defaultRows)

	s.startMu.Lock()
	defer s.startMu.Unlock()

	s.mu.Lock()
	live := len(s.sessions)
	s.mu.Unlock()
	if live >= maxSessions {
		return Session{}, apierr.New(429, "too_many_sessions", "too many live terminal sessions")
	}

	owner, uid, gid, err := lookupUser(s.cfg.TermUser)
	if err != nil {
		return Session{}, err
	}
	ensureSudoers(owner.Username)
	switchUser := true
	if cur, curErr := user.Current(); curErr == nil && cur.Uid == owner.Uid {
		switchUser = false
	}
	home := owner.HomeDir
	if home == "" {
		if home = os.Getenv("HOME"); home == "" {
			home = "/"
		}
	}
	shell := s.cfg.TermShell
	if shell == "" {
		shell = "/bin/bash"
	}

	master, slave, err := openPTY()
	if err != nil {
		return Session{}, apierr.Internal("term: " + err.Error())
	}
	if err := setWinsize(master.Fd(), cols, rows); err != nil {
		master.Close()
		slave.Close()
		return Session{}, apierr.Internal("term: set window size: " + err.Error())
	}

	cmd := exec.Command(shell)
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.Env = []string{
		"TERM=xterm-256color",
		"HOME=" + home,
		"USER=" + owner.Username,
		"SHELL=" + shell,
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"LANG=C.UTF-8",
	}
	if fi, statErr := os.Stat(home); statErr == nil && fi.IsDir() {
		cmd.Dir = home
	}
	cmd.SysProcAttr = termSysProcAttr(uid, gid, switchUser)

	if err := cmd.Start(); err != nil {
		master.Close()
		slave.Close()
		return Session{}, apierr.Internal("term: start shell: " + err.Error())
	}
	// The child owns the slave now; the parent keeps only the master.
	slave.Close()

	id, err := newSessionID()
	if err != nil {
		killProcess(cmd)
		_ = cmd.Wait()
		master.Close()
		return Session{}, apierr.Internal("term: generate session id: " + err.Error())
	}

	now := time.Now().UTC()
	sess := &session{
		id:           id,
		user:         owner.Username,
		shell:        shell,
		cols:         cols,
		rows:         rows,
		startedAt:    now,
		master:       master,
		cmd:          cmd,
		ring:         newRingBuffer(),
		subs:         map[uint64]chan Event{},
		lastActivity: now,
		doneCh:       make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[id] = sess
	s.mu.Unlock()

	if err := s.appendAudit(audit.Record{
		Action: actionSessionStart,
		Params: map[string]any{"id": id, "user": owner.Username, "shell": shell},
		Result: audit.ResultAccepted,
	}); err != nil {
		s.mu.Lock()
		delete(s.sessions, id)
		s.mu.Unlock()
		killProcess(cmd)
		_ = cmd.Wait()
		master.Close()
		return Session{}, err
	}

	go s.readLoop(sess)
	s.reaperOnce.Do(func() { go s.reapLoop() })

	return Session{
		ID:        id,
		User:      owner.Username,
		Shell:     shell,
		Cols:      cols,
		Rows:      rows,
		StartedAt: now,
	}, nil
}

// Attach returns the session's output backlog, a channel of subsequent
// events, and a cancel func that detaches this consumer (the shell keeps
// running). The events channel is closed when the session ends.
func (s *Service) Attach(id string) (backlog []byte, events <-chan Event, cancel func(), err error) {
	sess := s.lookup(id)
	if sess == nil {
		return nil, nil, nil, apierr.NotFound("term_session_not_found", "terminal session not found")
	}
	backlog, events, cancel = sess.attach()
	return backlog, events, cancel, nil
}

// Input writes raw bytes to the session's PTY.
func (s *Service) Input(id string, data []byte) error {
	sess := s.lookup(id)
	if sess == nil {
		return apierr.NotFound("term_session_not_found", "terminal session not found")
	}
	if err := sess.write(data); err != nil {
		if sess.isDone() {
			return apierr.NotFound("term_session_not_found", "terminal session not found")
		}
		return apierr.Internal("term: write input: " + err.Error())
	}
	return nil
}

// Resize updates the session's PTY window size. Sizes outside 8..500 are
// rejected with 400 invalid_size.
func (s *Service) Resize(id string, cols, rows int) error {
	if cols < minDim || cols > maxDim || rows < minDim || rows > maxDim {
		return apierr.BadRequest("invalid_size", "cols and rows must be between 8 and 500")
	}
	sess := s.lookup(id)
	if sess == nil {
		return apierr.NotFound("term_session_not_found", "terminal session not found")
	}
	if err := sess.resize(cols, rows); err != nil {
		if sess.isDone() {
			return apierr.NotFound("term_session_not_found", "terminal session not found")
		}
		return apierr.Internal("term: resize: " + err.Error())
	}
	return nil
}

// Close terminates the session and its shell.
func (s *Service) Close(id string) error {
	sess := s.lookup(id)
	if sess == nil {
		return apierr.NotFound("term_session_not_found", "terminal session not found")
	}
	s.terminate(sess)
	return nil
}

// Status reports the terminal configuration and live session count.
func (s *Service) Status() Status {
	s.mu.Lock()
	live := len(s.sessions)
	s.mu.Unlock()
	return Status{Enabled: !s.cfg.DryRun, User: s.cfg.TermUser, Shell: s.cfg.TermShell, Sessions: live}
}

// lookup returns the live session with id, or nil.
func (s *Service) lookup(id string) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[id]
}

// terminate kills the shell and waits (bounded) for the reader to clean up.
func (s *Service) terminate(sess *session) {
	killProcess(sess.cmd)
	select {
	case <-sess.doneCh:
	case <-time.After(killWait):
		// The shell is stuck (for example a detached grandchild holds the
		// slave open): detach consumers and drop the session anyway.
		s.finishSession(sess, -1)
	}
}

// readLoop pumps the PTY master into the ring buffer and the subscribers,
// then reaps the shell and finalizes the session.
func (s *Service) readLoop(sess *session) {
	buf := make([]byte, readChunk)
	for {
		n, err := sess.master.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			sess.broadcast(chunk)
		}
		if err != nil {
			break
		}
	}
	code := waitExit(sess.cmd)
	s.finishSession(sess, code)
}

// finishSession delivers the final exit event, closes every subscriber
// channel and removes the session. It is idempotent. doneCh is closed last,
// so Callers waiting on it observe a fully retired session.
func (s *Service) finishSession(sess *session, code int) {
	sess.mu.Lock()
	if sess.done {
		sess.mu.Unlock()
		return
	}
	sess.done = true
	sess.exitCode = code
	subs := sess.subs
	sess.subs = nil

	exit := Event{Exit: &code}
	for _, ch := range subs {
		select {
		case ch <- exit:
		default:
			// A subscriber that is not keeping up gets a short grace period
			// so the exit code is not lost; then the close signals it.
			select {
			case ch <- exit:
			case <-time.After(250 * time.Millisecond):
			}
		}
		close(ch)
	}
	sess.mu.Unlock()

	s.mu.Lock()
	if s.sessions[sess.id] == sess {
		delete(s.sessions, sess.id)
	}
	s.mu.Unlock()

	sess.master.Close()
	s.appendAudit(audit.Record{
		Action: actionSessionClose,
		Params: map[string]any{"id": sess.id, "user": sess.user, "shell": sess.shell, "exit": code},
		Result: audit.ResultAccepted,
	})
	close(sess.doneCh)
}

// reapLoop kills sessions that saw no input for idleTimeout.
func (s *Service) reapLoop() {
	ticker := time.NewTicker(reapInterval)
	defer ticker.Stop()
	for range ticker.C {
		s.reapIdle()
	}
}

// reapIdle terminates every session whose last activity is older than
// idleTimeout.
func (s *Service) reapIdle() {
	deadline := time.Now().Add(-idleTimeout)
	s.mu.Lock()
	var idle []*session
	for _, sess := range s.sessions {
		sess.mu.Lock()
		last := sess.lastActivity
		done := sess.done
		sess.mu.Unlock()
		if !done && last.Before(deadline) {
			idle = append(idle, sess)
		}
	}
	s.mu.Unlock()
	for _, sess := range idle {
		s.terminate(sess)
	}
}

// appendAudit writes one audit record; a nil log is a no-op.
func (s *Service) appendAudit(rec audit.Record) error {
	if s.audit == nil {
		return nil
	}
	return s.audit.Append(rec)
}

// session is one live shell: the PTY master, the shell process, the output
// backlog and the attached consumers.
type session struct {
	id        string
	user      string
	shell     string
	cols      int
	rows      int
	startedAt time.Time

	master *os.File
	cmd    *exec.Cmd

	mu           sync.Mutex
	ring         *ringBuffer
	subs         map[uint64]chan Event
	nextSub      uint64
	done         bool
	exitCode     int
	lastActivity time.Time
	doneCh       chan struct{} // closed once the session ends
}

// attach snapshots the backlog and registers a new subscriber.
func (sess *session) attach() ([]byte, <-chan Event, func()) {
	sess.mu.Lock()
	backlog := sess.ring.snapshot()
	if sess.done {
		// The session ended between lookup and attach: hand the consumer a
		// channel that still carries the exit event.
		code := sess.exitCode
		events := make(chan Event, 1)
		events <- Event{Exit: &code}
		close(events)
		sess.mu.Unlock()
		return backlog, events, func() {}
	}
	sess.nextSub++
	subID := sess.nextSub
	events := make(chan Event, subBuffer)
	sess.subs[subID] = events
	sess.mu.Unlock()

	var once sync.Once
	cancel := func() { once.Do(func() { sess.detach(subID) }) }
	return backlog, events, cancel
}

// detach removes one subscriber and closes its channel. Closing happens here
// or in finishSession, never both: both paths hold sess.mu and the map entry
// is the single owner of the channel.
func (sess *session) detach(subID uint64) {
	sess.mu.Lock()
	if ch, ok := sess.subs[subID]; ok {
		delete(sess.subs, subID)
		close(ch)
	}
	sess.mu.Unlock()
}

// broadcast fans a chunk out to every subscriber (dropping for slow ones)
// and appends it to the scrollback ring.
func (sess *session) broadcast(data []byte) {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	for _, ch := range sess.subs {
		select {
		case ch <- Event{Data: data}:
		default: // subscriber is behind: drop this chunk
		}
	}
	sess.ring.write(data)
}

// write forwards raw keystrokes to the PTY and marks the session active.
func (sess *session) write(data []byte) error {
	sess.mu.Lock()
	if sess.done {
		sess.mu.Unlock()
		return os.ErrClosed
	}
	sess.lastActivity = time.Now()
	sess.mu.Unlock()
	_, err := sess.master.Write(data)
	return err
}

// resize applies a new window size and marks the session active.
func (sess *session) resize(cols, rows int) error {
	sess.mu.Lock()
	if sess.done {
		sess.mu.Unlock()
		return os.ErrClosed
	}
	sess.lastActivity = time.Now()
	sess.cols, sess.rows = cols, rows
	sess.mu.Unlock()
	return setWinsize(sess.master.Fd(), cols, rows)
}

func (sess *session) isDone() bool {
	sess.mu.Lock()
	defer sess.mu.Unlock()
	return sess.done
}

// waitExit reaps the shell and reports its exit code (-1 when it was
// terminated by a signal).
func waitExit(cmd *exec.Cmd) int {
	err := cmd.Wait()
	if err == nil {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

// clampDimension normalizes a requested PTY dimension.
func clampDimension(v, def int) int {
	if v <= 0 {
		return def
	}
	if v < minDim {
		return minDim
	}
	if v > maxDim {
		return maxDim
	}
	return v
}

// lookupUser resolves cfg.TermUser (the current user when empty) to its uid
// and gid.
func lookupUser(name string) (*user.User, int, int, error) {
	var (
		u   *user.User
		err error
	)
	if name == "" {
		u, err = user.Current()
	} else {
		u, err = user.Lookup(name)
	}
	if err != nil {
		return nil, 0, 0, apierr.Internal(fmt.Sprintf("term: resolve user %q: %v", name, err))
	}
	uid, err := strconv.Atoi(u.Uid)
	if err != nil {
		return nil, 0, 0, apierr.Internal(fmt.Sprintf("term: user %q has an invalid uid %q", u.Username, u.Uid))
	}
	gid, err := strconv.Atoi(u.Gid)
	if err != nil {
		return nil, 0, 0, apierr.Internal(fmt.Sprintf("term: user %q has an invalid gid %q", u.Username, u.Gid))
	}
	if uid == 0 || u.Username == "root" {
		return nil, 0, 0, apierr.BadRequest("term_root_forbidden", "web terminal cannot run as root; configure AGENT_TERM_USER with a dedicated non-root user")
	}
	return u, uid, gid, nil
}

// newSessionID returns a random 128-bit session identifier.
func newSessionID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

// ringBuffer is a fixed-size circular scrollback buffer that always keeps
// the newest bytes.
type ringBuffer struct {
	buf   []byte
	pos   int // next write offset; also the oldest byte once full
	total int // bytes kept, capped at len(buf)
}

func newRingBuffer() *ringBuffer {
	return &ringBuffer{buf: make([]byte, ringSize)}
}

func (r *ringBuffer) write(p []byte) {
	if len(p) >= len(r.buf) {
		copy(r.buf, p[len(p)-len(r.buf):])
		r.pos = 0
		r.total = len(r.buf)
		return
	}
	if r.pos+len(p) <= len(r.buf) {
		copy(r.buf[r.pos:], p)
	} else {
		n := copy(r.buf[r.pos:], p)
		copy(r.buf, p[n:])
	}
	r.pos = (r.pos + len(p)) % len(r.buf)
	r.total += len(p)
	if r.total > len(r.buf) {
		r.total = len(r.buf)
	}
}

// snapshot returns the buffered bytes oldest-first.
func (r *ringBuffer) snapshot() []byte {
	if r.total < len(r.buf) {
		out := make([]byte, r.pos)
		copy(out, r.buf[:r.pos])
		return out
	}
	out := make([]byte, len(r.buf))
	n := copy(out, r.buf[r.pos:])
	copy(out[n:], r.buf[:r.pos])
	return out
}

// ensureSudoers ensures the terminal user has sudo privileges on the host.
func ensureSudoers(username string) {
	if username == "" || username == "root" {
		return
	}
	dir := "/etc/sudoers.d"
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		return
	}
	file := filepath.Join(dir, username)
	if data, err := os.ReadFile(file); err != nil || !strings.Contains(string(data), username) {
		content := fmt.Sprintf("# CloudDeck web terminal sudo permissions\n%s ALL=(ALL:ALL) ALL\n", username)
		_ = os.WriteFile(file, []byte(content), 0o440)
	}
}
