package files

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func assertCode(t *testing.T, err error, status int, code string) {
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

func TestValidatePath(t *testing.T) {
	valid := []string{
		"",
		"file.txt",
		"dir/file.txt",
		"a/b/c/d/e/f",
		"with space/and-dash_and.dot",
		"unicode-目录/файл.txt",
		strings.Repeat("a", maxPathLen),
	}
	for _, rel := range valid {
		if err := validatePath(rel); err != nil {
			t.Errorf("validatePath(%q) = %v, want valid", rel, err)
		}
	}

	invalid := []string{
		"/etc/passwd",
		"/",
		"..",
		".",
		"../x",
		"a/../b",
		"a/./b",
		"a//b",
		"a/",
		"a\\b",
		"\\a",
		"a\x00b",
		"a/b/../../..",
		strings.Repeat("a", maxPathLen+1),
	}
	for _, rel := range invalid {
		err := validatePath(rel)
		if err == nil {
			t.Errorf("validatePath(%q) = nil, want error", rel)
			continue
		}
		assertCode(t, err, 400, "invalid_path")
	}
}

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"x.txt":           "x.txt",
		"a/b/../x.txt":    "x.txt",
		"a/b/x.txt":       "x.txt",
		"../evil":         "evil",
		"dir\\sub\\x.txt": "x.txt",
		"..hidden":        "..hidden",
		"archive.tar.gz":  "archive.tar.gz",
	}
	for raw, want := range cases {
		got, err := sanitizeName(raw)
		if err != nil {
			t.Errorf("sanitizeName(%q) = %v, want %q", raw, err, want)
			continue
		}
		if got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", raw, got, want)
		}
	}
	for _, raw := range []string{"", ".", "..", "/", "a/..", "a\\..", "\x00", "../../"} {
		_, err := sanitizeName(raw)
		assertCode(t, err, 400, "bad_name")
	}
}

func TestResolvePath(t *testing.T) {
	root := t.TempDir()
	mustMkdir(t, filepath.Join(root, "a", "b"))
	mustWrite(t, filepath.Join(root, "a", "f.txt"), "x")
	mustSymlink(t, filepath.Join(root, "a"), filepath.Join(root, "link"))
	mustSymlink(t, filepath.Join(root, "a", "f.txt"), filepath.Join(root, "filelink"))

	tests := []struct {
		name   string
		rel    string
		opts   resolveOpts
		want   string // expected suffix of resolved path, "" = expect error
		status int
		code   string
	}{
		{name: "webroot", rel: "", opts: listOpts, want: root},
		{name: "existing dir", rel: "a/b", opts: listOpts, want: filepath.Join(root, "a", "b")},
		{name: "existing file", rel: "a/f.txt", opts: readOpts, want: filepath.Join(root, "a", "f.txt")},
		{name: "final symlink allowed for list", rel: "link", opts: listOpts, want: filepath.Join(root, "link")},
		{name: "final symlink allowed for delete", rel: "filelink", opts: deleteOpts, want: filepath.Join(root, "filelink")},
		{name: "final symlink rejected for read", rel: "link", opts: readOpts, status: 409, code: "symlink"},
		{name: "parent symlink rejected", rel: "link/b", opts: listOpts, status: 409, code: "symlink"},
		{name: "missing read", rel: "nope", opts: readOpts, status: 404, code: "not_found"},
		{name: "missing deep read", rel: "a/b/c", opts: readOpts, status: 404, code: "not_found"},
		{name: "write final ok", rel: "a/new.txt", opts: writeOpts, want: filepath.Join(root, "a", "new.txt")},
		{name: "write parent missing", rel: "missing/new.txt", opts: writeOpts, status: 404, code: "parent_missing"},
		{name: "write through file", rel: "a/f.txt/deep.txt", opts: writeOpts, status: 404, code: "parent_missing"},
		{name: "write final symlink", rel: "filelink", opts: writeOpts, status: 409, code: "symlink"},
		{name: "mkdir missing ok", rel: "new1/new2", opts: mkdirOpts, want: filepath.Join(root, "new1", "new2")},
		{name: "mkdir through file", rel: "a/f.txt/x", opts: mkdirOpts, status: 409, code: "exists"},
		{name: "rename from missing", rel: "gone", opts: renameFromOpts, status: 404, code: "from_missing"},
		{name: "rename to parent missing", rel: "gone2/x", opts: renameToOpts, status: 404, code: "parent_missing"},
		{name: "traversal", rel: "../../etc/passwd", opts: readOpts, status: 400, code: "invalid_path"},
		{name: "absolute", rel: "/etc/passwd", opts: readOpts, status: 400, code: "invalid_path"},
		{name: "backslash", rel: "a\\b", opts: readOpts, status: 400, code: "invalid_path"},
		{name: "nul", rel: "a\x00b", opts: readOpts, status: 400, code: "invalid_path"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			abs, _, err := resolvePath(root, tc.rel, tc.opts)
			if tc.code != "" {
				assertCode(t, err, tc.status, tc.code)
				return
			}
			if err != nil {
				t.Fatalf("resolvePath(%q) = %v, want %s", tc.rel, err, tc.want)
			}
			if abs != tc.want {
				t.Errorf("resolvePath(%q) = %s, want %s", tc.rel, abs, tc.want)
			}
		})
	}
}

// newTestService wires a store with one site rooted at a temp webroot.
func newTestService(t *testing.T, dryRun bool) (*Service, string, string) {
	t.Helper()
	stateDir := t.TempDir()
	st, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	root := filepath.Join(t.TempDir(), "example.com")
	mustMkdir(t, root)
	now := store.Now()
	if err := st.CreateSite(store.Site{
		Domain: "example.com", Root: root, PHPVersion: "none",
		Status: store.SiteActive, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}
	auditDir := t.TempDir()
	auditLog, err := audit.Open(auditDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{Webroot: filepath.Dir(root), DryRun: dryRun}
	return New(st, auditLog, cfg), root, auditDir
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustSymlink(t *testing.T, oldname, newname string) {
	t.Helper()
	if err := os.Symlink(oldname, newname); err != nil {
		t.Fatalf("symlink %s -> %s: %v", newname, oldname, err)
	}
}

func TestServiceRoundtrip(t *testing.T) {
	svc, root, auditDir := newTestService(t, false)

	// mkdir
	path, err := svc.Mkdir("example.com", "sub")
	if err != nil || path != "sub" {
		t.Fatalf("Mkdir = %q, %v", path, err)
	}
	if fi, err := os.Stat(filepath.Join(root, "sub")); err != nil || !fi.IsDir() {
		t.Fatalf("sub not created: %v", err)
	}

	// mkdir existing
	_, err = svc.Mkdir("example.com", "sub")
	assertCode(t, err, 409, "exists")

	// mkdir nested (parents created)
	if _, err := svc.Mkdir("example.com", "deep/nested/dir"); err != nil {
		t.Fatalf("Mkdir nested: %v", err)
	}

	// mkdir through file
	mustWrite(t, filepath.Join(root, "plain.txt"), "x")
	_, err = svc.Mkdir("example.com", "plain.txt/under")
	assertCode(t, err, 409, "exists")

	// write + read
	res, err := svc.Write("example.com", "sub/hello.txt", "hello world")
	if err != nil || res.SizeBytes != 11 {
		t.Fatalf("Write = %+v, %v", res, err)
	}
	read, err := svc.Read("example.com", "sub/hello.txt")
	if err != nil || read.Content != "hello world" || read.SizeBytes != 11 {
		t.Fatalf("Read = %+v, %v", read, err)
	}

	// read errors
	_, err = svc.Read("example.com", "sub/nope.txt")
	assertCode(t, err, 404, "not_found")
	_, err = svc.Read("example.com", "sub")
	assertCode(t, err, 400, "not_a_file")
	_, err = svc.Write("example.com", "sub/hello.txt/under.txt", "x")
	assertCode(t, err, 404, "parent_missing")
	_, err = svc.Write("example.com", "sub", "x")
	assertCode(t, err, 409, "is_a_directory")

	// list
	_, entries, err := svc.List("example.com", "sub")
	if err != nil || len(entries) != 1 || entries[0].Name != "hello.txt" || entries[0].Type != "file" {
		t.Fatalf("List(sub) = %+v, %v", entries, err)
	}
	_, entries, err = svc.List("example.com", "")
	if err != nil {
		t.Fatalf("List(root): %v", err)
	}
	if len(entries) == 0 || entries[0].Type != "dir" {
		t.Fatalf("List(root) = %+v, want dirs first", entries)
	}
	_, _, err = svc.List("example.com", "sub/hello.txt")
	assertCode(t, err, 400, "not_a_directory")
	_, _, err = svc.List("example.com", "missing")
	assertCode(t, err, 404, "not_found")

	// rename
	if _, _, err := svc.Rename("example.com", "sub/hello.txt", "sub/hi.txt"); err != nil {
		t.Fatalf("Rename: %v", err)
	}
	if _, err := svc.Read("example.com", "sub/hi.txt"); err != nil {
		t.Fatalf("Read after rename: %v", err)
	}
	_, err = svc.Read("example.com", "sub/hello.txt")
	assertCode(t, err, 404, "not_found")
	_, _, err = svc.Rename("example.com", "sub/missing", "sub/x")
	assertCode(t, err, 404, "from_missing")
	_, _, err = svc.Rename("example.com", "sub/hi.txt", "sub")
	assertCode(t, err, 409, "to_exists")
	_, _, err = svc.Rename("example.com", "sub", "sub/inner")
	assertCode(t, err, 400, "invalid_path")

	// symlink handling
	mustSymlink(t, filepath.Join(root, "sub", "hi.txt"), filepath.Join(root, "sub", "link.txt"))
	_, err = svc.Read("example.com", "sub/link.txt")
	assertCode(t, err, 409, "symlink")
	_, err = svc.Write("example.com", "sub/link.txt", "overwritten")
	assertCode(t, err, 409, "symlink")
	_, _, err = svc.Rename("example.com", "sub/link.txt", "sub/moved.txt")
	assertCode(t, err, 409, "symlink")
	if _, err := svc.Delete("example.com", "sub/link.txt", false); err != nil {
		t.Fatalf("Delete symlink: %v", err)
	}
	if _, err := svc.Read("example.com", "sub/hi.txt"); err != nil {
		t.Fatalf("symlink target affected: %v", err)
	}
	mustSymlink(t, root, filepath.Join(root, "sneaky"))
	_, _, err = svc.List("example.com", "sneaky/file")
	assertCode(t, err, 409, "symlink")

	// delete dir
	_, err = svc.Delete("example.com", "sub", false)
	assertCode(t, err, 409, "not_empty")
	if _, err := svc.Delete("example.com", "sub", true); err != nil {
		t.Fatalf("Delete recursive: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, "sub")); !os.IsNotExist(err) {
		t.Fatalf("sub still on disk: %v", err)
	}
	_, err = svc.Delete("example.com", "sub", false)
	assertCode(t, err, 404, "not_found")
	_, err = svc.Delete("example.com", "", true)
	assertCode(t, err, 400, "invalid_path")

	// audit trail contains accepted mutations
	data, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	for _, want := range []string{`"action":"file.write"`, `"action":"file.mkdir"`, `"action":"file.rename"`, `"action":"file.delete"`, `"result":"accepted"`} {
		if !strings.Contains(string(data), want) {
			t.Errorf("audit log missing %s", want)
		}
	}
}

func TestListSorting(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustMkdir(t, filepath.Join(root, "Zdir"))
	mustMkdir(t, filepath.Join(root, "adir"))
	for _, name := range []string{"c.txt", "B.txt", "a.txt"} {
		mustWrite(t, filepath.Join(root, name), "x")
	}
	_, entries, err := svc.List("example.com", "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name)
	}
	want := []string{"adir", "Zdir", "a.txt", "B.txt", "c.txt"}
	if len(names) != len(want) {
		t.Fatalf("names = %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("names = %v, want %v", names, want)
		}
	}
}

func TestUpload(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	if _, err := svc.Mkdir("example.com", "up"); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}

	up, err := svc.Upload("example.com", "up", "a/b/../x.txt", strings.NewReader("data"), false)
	if err != nil || up.Name != "x.txt" || up.SizeBytes != 4 {
		t.Fatalf("Upload = %+v, %v", up, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "up", "x.txt"))
	if err != nil || string(data) != "data" {
		t.Fatalf("uploaded file = %q, %v", data, err)
	}

	_, err = svc.Upload("example.com", "up", "x.txt", strings.NewReader("no"), false)
	assertCode(t, err, 409, "exists")
	if _, err := svc.Upload("example.com", "up", "x.txt", strings.NewReader("new"), true); err != nil {
		t.Fatalf("Upload overwrite: %v", err)
	}
	data, _ = os.ReadFile(filepath.Join(root, "up", "x.txt"))
	if string(data) != "new" {
		t.Fatalf("overwrite content = %q", data)
	}

	for _, bad := range []string{"", ".", ".."} {
		_, err = svc.Upload("example.com", "up", bad, strings.NewReader("x"), false)
		assertCode(t, err, 400, "bad_name")
	}
	_, err = svc.Upload("example.com", "missing", "x.txt", strings.NewReader("x"), false)
	assertCode(t, err, 404, "not_found")
	_, err = svc.Upload("example.com", "up/x.txt", "y.txt", strings.NewReader("x"), false)
	assertCode(t, err, 400, "not_a_directory")

	// final symlink is never overwritten
	mustSymlink(t, filepath.Join(root, "up", "x.txt"), filepath.Join(root, "up", "link.txt"))
	_, err = svc.Upload("example.com", "up", "link.txt", strings.NewReader("evil"), true)
	assertCode(t, err, 409, "symlink")
}

func TestUploadTooLarge(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	if _, err := svc.Mkdir("example.com", "up"); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	content := io.LimitReader(zeroReader{}, maxUploadBytes+1)
	_, err := svc.Upload("example.com", "up", "big.bin", content, false)
	assertCode(t, err, 413, "too_large")
	if _, err := os.Lstat(filepath.Join(root, "up", "big.bin")); !os.IsNotExist(err) {
		t.Fatalf("partial upload left behind: %v", err)
	}
	leftover, err := filepath.Glob(filepath.Join(root, "up", ".clouddeck-upload-*"))
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	if len(leftover) != 0 {
		t.Fatalf("temp upload files left behind: %v", leftover)
	}
}

func TestReadLimits(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustWrite(t, filepath.Join(root, "big.txt"), strings.Repeat("a", maxTextBytes+1))
	_, err := svc.Read("example.com", "big.txt")
	assertCode(t, err, 413, "too_large")

	mustWrite(t, filepath.Join(root, "bin.dat"), string([]byte{0xff, 0xfe, 0x00}))
	_, err = svc.Read("example.com", "bin.dat")
	assertCode(t, err, 415, "not_text")

	_, err = svc.Write("example.com", "toobig.txt", strings.Repeat("a", maxTextBytes+1))
	assertCode(t, err, 413, "too_large")
}

func TestDownload(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustWrite(t, filepath.Join(root, "dl.bin"), "bytes")
	dl, err := svc.Download("example.com", "dl.bin")
	if err != nil || dl.Name != "dl.bin" || dl.SizeBytes != 5 {
		t.Fatalf("Download = %+v, %v", dl, err)
	}
	_, err = svc.Download("example.com", "")
	assertCode(t, err, 413, "is_a_directory")
	_, err = svc.Download("example.com", "missing.bin")
	assertCode(t, err, 404, "not_found")
}

func TestDryRun(t *testing.T) {
	svc, root, _ := newTestService(t, true)
	_, _, err := svc.List("example.com", "")
	assertCode(t, err, 409, "dry_run")
	_, err = svc.Write("example.com", "x.txt", "x")
	assertCode(t, err, 409, "dry_run")
	_, err = svc.Mkdir("example.com", "dir")
	assertCode(t, err, 409, "dry_run")
	_, err = svc.Delete("example.com", "x.txt", true)
	assertCode(t, err, 409, "dry_run")
	if _, err := os.Lstat(filepath.Join(root, "x.txt")); !os.IsNotExist(err) {
		t.Fatalf("dry-run mutated the filesystem: %v", err)
	}
}

func TestSiteNotFound(t *testing.T) {
	svc, _, _ := newTestService(t, false)
	_, _, err := svc.List("unknown.example", "")
	assertCode(t, err, 404, "site_not_found")
}
