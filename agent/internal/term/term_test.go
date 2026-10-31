package term

import (
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

const marker = "clouddeck-term-marker"

func requireLinux(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("terminal sessions require a Linux PTY")
	}
}

// testShell picks the first shell that exists on this machine.
func testShell(t *testing.T) string {
	t.Helper()
	for _, sh := range []string{"/bin/bash", "/usr/bin/bash", "/bin/sh"} {
		if fi, err := os.Stat(sh); err == nil && !fi.IsDir() {
			return sh
		}
	}
	t.Skip("no shell found")
	return ""
}

// newTestService builds a service that runs shells as the current user, so
// no credential switch is attempted (which would need root).
func newTestService(t *testing.T, dryRun bool) *Service {
	t.Helper()
	auditLog, err := audit.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open audit log: %v", err)
	}
	cur, err := user.Current()
	if err != nil {
		t.Skipf("current user unavailable: %v", err)
	}
	cfg := config.Config{DryRun: dryRun, TermUser: cur.Username, TermShell: testShell(t)}
	return New(cfg, auditLog)
}

func assertAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("got nil error, want %d %s", status, code)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("got %v, want typed apierr %d %s", err, status, code)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Errorf("got %d %s (%s), want %d %s", apiErr.Status, apiErr.Code, apiErr.Message, status, code)
	}
}

// drainUntil consumes events until the PTY output contains want, the shell
// exits, or timeout elapses.
func drainUntil(t *testing.T, events <-chan Event, want string, timeout time.Duration) []byte {
	t.Helper()
	deadline := time.After(timeout)
	var out []byte
	for !strings.Contains(string(out), want) {
		select {
		case ev, ok := <-events:
			if !ok {
				t.Fatalf("event stream closed before %q arrived; output so far %q", want, out)
			}
			if ev.Exit != nil {
				t.Fatalf("shell exited (code %d) before %q arrived; output so far %q", *ev.Exit, want, out)
			}
			out = append(out, ev.Data...)
		case <-deadline:
			t.Fatalf("timed out waiting for %q; output so far %q", want, out)
		}
	}
	return out
}

func TestSessionLifecycle(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	sess, err := svc.Start(0, 0)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if sess.ID == "" {
		t.Error("session id is empty")
	}
	if sess.Cols != defaultCols || sess.Rows != defaultRows {
		t.Errorf("default size = %dx%d, want %dx%d", sess.Cols, sess.Rows, defaultCols, defaultRows)
	}
	if sess.User == "" || sess.Shell == "" {
		t.Errorf("session user/shell = %q/%q, want both non-empty", sess.User, sess.Shell)
	}
	closed := false
	t.Cleanup(func() {
		if !closed {
			_ = svc.Close(sess.ID)
		}
	})

	if got := svc.Status().Sessions; got != 1 {
		t.Errorf("status sessions = %d, want 1", got)
	}

	_, events, cancel, err := svc.Attach(sess.ID)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	defer cancel()

	if err := svc.Input(sess.ID, []byte("echo "+marker+"\r")); err != nil {
		t.Fatalf("input: %v", err)
	}
	drainUntil(t, events, marker, 10*time.Second)
	cancel() // detach without killing the shell

	// A late consumer must receive the backlog.
	backlog, events2, cancel2, err := svc.Attach(sess.ID)
	if err != nil {
		t.Fatalf("re-attach: %v", err)
	}
	defer cancel2()
	if !strings.Contains(string(backlog), marker) {
		t.Errorf("backlog does not contain %q", marker)
	}

	if err := svc.Resize(sess.ID, 100, 40); err != nil {
		t.Fatalf("resize: %v", err)
	}
	// The shell survives a detach and a resize.
	if err := svc.Input(sess.ID, []byte("echo "+marker+"-again\r")); err != nil {
		t.Fatalf("input after resize: %v", err)
	}
	drainUntil(t, events2, marker+"-again", 10*time.Second)

	if err := svc.Close(sess.ID); err != nil {
		t.Fatalf("close: %v", err)
	}
	closed = true

	if _, _, _, err := svc.Attach(sess.ID); err == nil {
		t.Error("attach after close succeeded, want 404")
	} else {
		assertAPIError(t, err, 404, "term_session_not_found")
	}
	assertAPIError(t, svc.Input(sess.ID, []byte("x")), 404, "term_session_not_found")
	assertAPIError(t, svc.Resize(sess.ID, 80, 24), 404, "term_session_not_found")
	assertAPIError(t, svc.Close(sess.ID), 404, "term_session_not_found")
	if _, _, _, err := svc.Attach("no-such-session"); err == nil {
		t.Error("attach of unknown session succeeded, want 404")
	} else {
		assertAPIError(t, err, 404, "term_session_not_found")
	}
	if got := svc.Status().Sessions; got != 0 {
		t.Errorf("status sessions after close = %d, want 0", got)
	}
}

func TestSizeValidation(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	// Out-of-range Start sizes are clamped.
	sess, err := svc.Start(4, 999)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close(sess.ID) })
	if sess.Cols != minDim || sess.Rows != maxDim {
		t.Errorf("clamped size = %dx%d, want %dx%d", sess.Cols, sess.Rows, minDim, maxDim)
	}

	// Out-of-range Resize sizes are rejected.
	assertAPIError(t, svc.Resize(sess.ID, 0, 0), 400, "invalid_size")
	assertAPIError(t, svc.Resize(sess.ID, 7, 24), 400, "invalid_size")
	assertAPIError(t, svc.Resize(sess.ID, 80, 501), 400, "invalid_size")
	if err := svc.Resize(sess.ID, 120, 50); err != nil {
		t.Errorf("resize within bounds: %v", err)
	}
}

func TestMaxSessions(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	var ids []string
	t.Cleanup(func() {
		for _, id := range ids {
			_ = svc.Close(id)
		}
	})
	for i := 0; i < maxSessions; i++ {
		sess, err := svc.Start(80, 24)
		if err != nil {
			t.Fatalf("start %d: %v", i, err)
		}
		ids = append(ids, sess.ID)
	}
	if got := svc.Status().Sessions; got != maxSessions {
		t.Errorf("status sessions = %d, want %d", got, maxSessions)
	}

	_, err := svc.Start(80, 24)
	assertAPIError(t, err, 429, "too_many_sessions")

	// Closing one session frees a slot.
	if err := svc.Close(ids[0]); err != nil {
		t.Fatalf("close: %v", err)
	}
	ids = ids[1:]
	sess, err := svc.Start(80, 24)
	if err != nil {
		t.Fatalf("start after close: %v", err)
	}
	ids = append(ids, sess.ID)
}

// waitChannelClosed drains events until the channel closes or timeout
// elapses.
func waitChannelClosed(events <-chan Event, timeout time.Duration) bool {
	deadline := time.After(timeout)
	for {
		select {
		case _, ok := <-events:
			if !ok {
				return true
			}
		case <-deadline:
			return false
		}
	}
}

func TestShellExitEvent(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	sess, err := svc.Start(80, 24)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close(sess.ID) })

	_, events, cancel, err := svc.Attach(sess.ID)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	defer cancel()

	if err := svc.Input(sess.ID, []byte("exit\r")); err != nil {
		t.Fatalf("input: %v", err)
	}

	deadline := time.After(10 * time.Second)
	var code *int
	for code == nil {
		select {
		case ev, ok := <-events:
			if !ok {
				t.Fatal("event stream closed without an exit event")
			}
			if ev.Exit != nil {
				code = ev.Exit
			}
		case <-deadline:
			t.Fatal("timed out waiting for the exit event")
		}
	}
	if *code != 0 {
		t.Errorf("exit code = %d, want 0", *code)
	}

	// The stream is closed right after the exit event, and the session is
	// retired.
	if !waitChannelClosed(events, 10*time.Second) {
		t.Fatal("events channel did not close after the exit event")
	}
	deadline = time.After(5 * time.Second)
	for {
		_, _, detach, err := svc.Attach(sess.ID)
		if err != nil {
			assertAPIError(t, err, 404, "term_session_not_found")
			break
		}
		detach()
		select {
		case <-deadline:
			t.Fatal("session still attached after shell exit")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestDryRunDisabled(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, true)

	_, err := svc.Start(80, 24)
	assertAPIError(t, err, 409, "term_disabled")

	status := svc.Status()
	if status.Enabled {
		t.Error("dry-run status enabled = true, want false")
	}
	if status.Sessions != 0 {
		t.Errorf("dry-run sessions = %d, want 0", status.Sessions)
	}
}

func TestIdleReaper(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	sess, err := svc.Start(80, 24)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() { _ = svc.Close(sess.ID) })

	// Backdate the session instead of waiting 15 minutes.
	live := svc.lookup(sess.ID)
	if live == nil {
		t.Fatal("session not registered")
	}
	live.mu.Lock()
	live.lastActivity = time.Now().Add(-idleTimeout - time.Minute)
	live.mu.Unlock()

	svc.reapIdle()

	assertAPIError(t, svc.Close(sess.ID), 404, "term_session_not_found")
	if got := svc.Status().Sessions; got != 0 {
		t.Errorf("status sessions after reap = %d, want 0", got)
	}
}

func TestRingBufferWraps(t *testing.T) {
	r := newRingBuffer()
	fill := make([]byte, ringSize+512)
	for i := range fill {
		fill[i] = byte(i % 251)
	}
	r.write(fill)
	got := r.snapshot()
	if len(got) != ringSize {
		t.Fatalf("snapshot length = %d, want %d", len(got), ringSize)
	}
	if string(got) != string(fill[len(fill)-ringSize:]) {
		t.Error("snapshot does not hold the newest bytes")
	}
}

func TestStartWorkingDir(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)

	targetDir := t.TempDir()
	sess, err := svc.Start(80, 24, targetDir)
	if err != nil {
		t.Fatalf("start with explicit dir: %v", err)
	}
	defer svc.Close(sess.ID)

	_, events, cancel, err := svc.Attach(sess.ID)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	defer cancel()

	if err := svc.Input(sess.ID, []byte("pwd\r")); err != nil {
		t.Fatalf("input: %v", err)
	}
	evalTarget, err := filepath.EvalSymlinks(targetDir)
	if err != nil {
		evalTarget = targetDir
	}
	drainUntil(t, events, evalTarget, 10*time.Second)
}

func TestStartWebroot(t *testing.T) {
	requireLinux(t)
	svc := newTestService(t, false)
	webroot := filepath.Join(t.TempDir(), "sites", "webroot")
	svc.cfg.Webroot = webroot

	sess, err := svc.Start(80, 24)
	if err != nil {
		t.Fatalf("start with webroot: %v", err)
	}
	defer svc.Close(sess.ID)

	fi, err := os.Stat(webroot)
	if err != nil {
		t.Fatalf("webroot not created: %v", err)
	}
	if perm := fi.Mode().Perm(); perm&0o755 != 0o755 {
		t.Errorf("webroot perm = %04o, want at least 0755", perm)
	}

	_, events, cancel, err := svc.Attach(sess.ID)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	defer cancel()

	if err := svc.Input(sess.ID, []byte("pwd\r")); err != nil {
		t.Fatalf("input: %v", err)
	}
	evalWebroot, err := filepath.EvalSymlinks(webroot)
	if err != nil {
		evalWebroot = webroot
	}
	drainUntil(t, events, evalWebroot, 10*time.Second)
}

func TestResolveDirPriorities(t *testing.T) {
	svc := newTestService(t, false)
	homeDir := t.TempDir()

	t.Run("explicit valid dir wins", func(t *testing.T) {
		explicit := t.TempDir()
		svc.cfg.Webroot = filepath.Join(t.TempDir(), "webroot")
		got := svc.resolveDir(homeDir, explicit)
		if got != explicit {
			t.Errorf("resolveDir = %q, want %q", got, explicit)
		}
	})

	t.Run("explicit invalid dir falls back to webroot", func(t *testing.T) {
		invalid := filepath.Join(t.TempDir(), "no-such-dir")
		webroot := filepath.Join(t.TempDir(), "webroot")
		svc.cfg.Webroot = webroot
		got := svc.resolveDir(homeDir, invalid)
		if got != webroot {
			t.Errorf("resolveDir = %q, want %q", got, webroot)
		}
		if fi, err := os.Stat(webroot); err != nil || !fi.IsDir() {
			t.Fatalf("webroot was not created: %v", err)
		}
	})

	t.Run("webroot existing with 0700 is chmodded to 0755", func(t *testing.T) {
		webroot := filepath.Join(t.TempDir(), "webroot")
		if err := os.MkdirAll(webroot, 0o700); err != nil {
			t.Fatal(err)
		}
		svc.cfg.Webroot = webroot
		got := svc.resolveDir(homeDir)
		if got != webroot {
			t.Errorf("resolveDir = %q, want %q", got, webroot)
		}
		fi, err := os.Stat(webroot)
		if err != nil || fi.Mode().Perm()&0o755 != 0o755 {
			t.Errorf("webroot permissions = %v, want 0755", fi.Mode().Perm())
		}
	})

	t.Run("webroot inaccessible falls back to home or var www", func(t *testing.T) {
		svc.cfg.Webroot = "/proc/invalid/cannot/create"
		got := svc.resolveDir(homeDir)
		if fi, err := os.Stat("/var/www"); err == nil && fi.IsDir() {
			if got != "/var/www" {
				t.Errorf("resolveDir = %q, want /var/www", got)
			}
		} else {
			if got != homeDir {
				t.Errorf("resolveDir = %q, want homeDir %q", got, homeDir)
			}
		}
	})

	t.Run("everything missing falls back to root", func(t *testing.T) {
		svc.cfg.Webroot = ""
		got := svc.resolveDir(filepath.Join(t.TempDir(), "no-such-home"))
		if fi, err := os.Stat("/var/www"); err == nil && fi.IsDir() {
			if got != "/var/www" {
				t.Errorf("resolveDir = %q, want /var/www", got)
			}
		} else {
			if got != "/" {
				t.Errorf("resolveDir = %q, want /", got)
			}
		}
	})
}
