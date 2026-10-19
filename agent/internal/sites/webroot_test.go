package sites

import (
	"os"
	"os/user"
	"path/filepath"
	"syscall"
	"testing"
)

func statUIDGID(t *testing.T, path string) (uint32, uint32) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		t.Fatalf("stat %s: unexpected Sys() type %T", path, info.Sys())
	}
	return st.Uid, st.Gid
}

func TestEnsureWebrootNoRunAsKeepsCurrentOwner(t *testing.T) {
	root := filepath.Join(t.TempDir(), "webroot", "site.test")
	if err := ensureWebroot(root, "site.test", "", func(string, string) {}); err != nil {
		t.Fatalf("ensureWebroot: %v", err)
	}
	uid, _ := statUIDGID(t, root)
	if uid != uint32(os.Getuid()) {
		t.Fatalf("webroot owner = %d, want %d", uid, os.Getuid())
	}
	if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
		t.Fatalf("placeholder index.html missing: %v", err)
	}
}

func TestEnsureWebrootChownsCreatedDirsToRunAs(t *testing.T) {
	current, err := user.Current()
	if err != nil {
		t.Skipf("user.Current: %v", err)
	}
	parent := t.TempDir()
	root := filepath.Join(parent, "webroot", "site.test")
	if err := ensureWebroot(root, "site.test", current.Username, func(string, string) {}); err != nil {
		t.Fatalf("ensureWebroot: %v", err)
	}
	// Both the created intermediate dir and the leaf are chowned (here to the
	// test user, since the test does not run as root), and so is the file the
	// service wrote.
	for _, path := range []string{
		filepath.Join(parent, "webroot"),
		root,
		filepath.Join(root, "index.html"),
	} {
		uid, _ := statUIDGID(t, path)
		if uid != uint32(os.Getuid()) {
			t.Fatalf("%s owner = %d, want %d", path, uid, os.Getuid())
		}
	}
}

func TestEnsureWebrootLeavesExistingDirsUntouched(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "webroot", "site.test")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := ensureWebroot(root, "site.test", "", func(string, string) {}); err != nil {
		t.Fatalf("ensureWebroot: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "index.html")); err != nil {
		t.Fatalf("placeholder index.html missing: %v", err)
	}
}

func TestEnsureWebrootUnknownRunAsFails(t *testing.T) {
	root := filepath.Join(t.TempDir(), "webroot", "site.test")
	if err := ensureWebroot(root, "site.test", "cd-no-such-user", func(string, string) {}); err == nil {
		t.Fatal("expected an error for an unknown run-as user")
	}
}
