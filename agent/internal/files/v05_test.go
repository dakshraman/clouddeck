package files

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// withCaps lowers the bulk-operation caps for one test.
func withCaps(t *testing.T, bytes, entries int64) {
	t.Helper()
	oldBytes, oldEntries := maxBulkBytes, maxBulkEntries
	maxBulkBytes, maxBulkEntries = bytes, entries
	t.Cleanup(func() { maxBulkBytes, maxBulkEntries = oldBytes, oldEntries })
}

func mustChmod(t *testing.T, path string, mode fs.FileMode) {
	t.Helper()
	if err := os.Chmod(path, mode); err != nil {
		t.Fatalf("chmod %s: %v", path, err)
	}
}

func mustPerm(t *testing.T, path string, want fs.FileMode) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat %s: %v", path, err)
	}
	if got := info.Mode().Perm(); got != want {
		t.Errorf("%s mode = %o, want %o", path, got, want)
	}
}

func wantNotExist(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Errorf("%s should not exist (Lstat err = %v)", path, err)
	}
}

// tarTestEntry describes one entry for writeTarGz.
type tarTestEntry struct {
	name     string
	body     string
	mode     int64
	typeflag byte
	linkname string
}

func writeTarGz(t *testing.T, archivePath string, entries []tarTestEntry) {
	t.Helper()
	f, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create %s: %v", archivePath, err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		hdr := &tar.Header{
			Name:     e.name,
			Mode:     e.mode,
			Size:     int64(len(e.body)),
			Typeflag: e.typeflag,
			Linkname: e.linkname,
		}
		if hdr.Typeflag == 0 {
			hdr.Typeflag = tar.TypeReg
		}
		if hdr.Typeflag == tar.TypeSymlink {
			hdr.Size = 0
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("tar header %s: %v", e.name, err)
		}
		if hdr.Typeflag != tar.TypeDir && hdr.Typeflag != tar.TypeSymlink {
			if _, err := tw.Write([]byte(e.body)); err != nil {
				t.Fatalf("tar body %s: %v", e.name, err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close archive: %v", err)
	}
}

// readTarGzEntries reads an archive with the standard library and returns
// name -> body (directories map to "").
func readTarGzEntries(t *testing.T, archivePath string) map[string]string {
	t.Helper()
	f, err := os.Open(archivePath)
	if err != nil {
		t.Fatalf("open %s: %v", archivePath, err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip %s: %v", archivePath, err)
	}
	defer gz.Close()
	out := map[string]string{}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("tar next %s: %v", archivePath, err)
		}
		data, err := io.ReadAll(tr)
		if err != nil {
			t.Fatalf("tar read %s: %v", hdr.Name, err)
		}
		out[hdr.Name] = string(data)
	}
	return out
}

// zipTestEntry describes one entry for writeZip.
type zipTestEntry struct {
	name     string
	body     string
	mode     fs.FileMode
	symlink  bool
	plainZip bool // create without a mode (zw.Create), like many tools do
}

func writeZip(t *testing.T, archivePath string, entries []zipTestEntry) {
	t.Helper()
	f, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create %s: %v", archivePath, err)
	}
	zw := zip.NewWriter(f)
	for _, e := range entries {
		if e.plainZip {
			w, err := zw.Create(e.name)
			if err != nil {
				t.Fatalf("zip create %s: %v", e.name, err)
			}
			if _, err := w.Write([]byte(e.body)); err != nil {
				t.Fatalf("zip body %s: %v", e.name, err)
			}
			continue
		}
		hdr := &zip.FileHeader{Name: e.name, Method: zip.Deflate}
		mode := e.mode
		if e.symlink {
			mode |= fs.ModeSymlink
		}
		hdr.SetMode(mode)
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			t.Fatalf("zip header %s: %v", e.name, err)
		}
		if _, err := w.Write([]byte(e.body)); err != nil {
			t.Fatalf("zip body %s: %v", e.name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close archive: %v", err)
	}
}

// readZipEntries reads a zip with the standard library and returns
// name -> body.
func readZipEntries(t *testing.T, archivePath string) map[string]string {
	t.Helper()
	zr, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatalf("open zip %s: %v", archivePath, err)
	}
	defer zr.Close()
	out := map[string]string{}
	for _, zf := range zr.File {
		rc, err := zf.Open()
		if err != nil {
			t.Fatalf("zip open %s: %v", zf.Name, err)
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("zip read %s: %v", zf.Name, err)
		}
		out[zf.Name] = string(data)
	}
	return out
}

func readAuditFile(t *testing.T, auditDir string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	return string(data)
}

func TestChmodV05(t *testing.T) {
	svc, root, auditDir := newTestService(t, false)

	mustWrite(t, filepath.Join(root, "a.txt"), "x")
	mustChmod(t, filepath.Join(root, "a.txt"), 0o600)
	path, err := svc.Chmod("example.com", "a.txt", "644")
	if err != nil || path != "a.txt" {
		t.Fatalf("Chmod = %q, %v", path, err)
	}
	mustPerm(t, filepath.Join(root, "a.txt"), 0o644)

	if _, err := svc.Chmod("example.com", "a.txt", "0750"); err != nil {
		t.Fatalf("Chmod 0750: %v", err)
	}
	mustPerm(t, filepath.Join(root, "a.txt"), 0o750)

	mustMkdir(t, filepath.Join(root, "d"))
	if _, err := svc.Chmod("example.com", "d", "700"); err != nil {
		t.Fatalf("Chmod dir: %v", err)
	}
	mustPerm(t, filepath.Join(root, "d"), 0o700)

	for _, mode := range []string{"", "77", "77777", "8", "89", "abc", "0o755", "075\n"} {
		_, err := svc.Chmod("example.com", "a.txt", mode)
		assertCode(t, err, 400, "invalid_mode")
	}

	_, err = svc.Chmod("example.com", "nope.txt", "644")
	assertCode(t, err, 404, "file_not_found")

	mustWrite(t, filepath.Join(root, "target.txt"), "x")
	mustChmod(t, filepath.Join(root, "target.txt"), 0o600)
	mustSymlink(t, filepath.Join(root, "target.txt"), filepath.Join(root, "link.txt"))
	_, err = svc.Chmod("example.com", "link.txt", "644")
	assertCode(t, err, 400, "invalid_path")
	mustPerm(t, filepath.Join(root, "target.txt"), 0o600)

	if !strings.Contains(readAuditFile(t, auditDir), `"action":"files.chmod"`) {
		t.Errorf("audit log missing files.chmod")
	}
}

func TestCopyV05(t *testing.T) {
	svc, root, auditDir := newTestService(t, false)

	mustWrite(t, filepath.Join(root, "src.txt"), "hello")
	mustChmod(t, filepath.Join(root, "src.txt"), 0o640)
	mustMkdir(t, filepath.Join(root, "dir", "nested"))
	mustWrite(t, filepath.Join(root, "dir", "a.txt"), "A")
	mustWrite(t, filepath.Join(root, "dir", "nested", "b.txt"), "B")
	mustSymlink(t, filepath.Join(root, "src.txt"), filepath.Join(root, "dir", "link.txt"))

	from, to, err := svc.Copy("example.com", "src.txt", "dst.txt", false)
	if err != nil || from != "src.txt" || to != "dst.txt" {
		t.Fatalf("Copy file = %q, %q, %v", from, to, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "dst.txt"))
	if err != nil || string(data) != "hello" {
		t.Fatalf("copied file = %q, %v", data, err)
	}
	mustPerm(t, filepath.Join(root, "dst.txt"), 0o640)

	if _, _, err := svc.Copy("example.com", "dir", "dir2", false); err != nil {
		t.Fatalf("Copy dir: %v", err)
	}
	data, _ = os.ReadFile(filepath.Join(root, "dir2", "nested", "b.txt"))
	if string(data) != "B" {
		t.Errorf("dir2/nested/b.txt = %q, want B", data)
	}
	wantNotExist(t, filepath.Join(root, "dir2", "link.txt"))

	// overwrite behaviour
	mustWrite(t, filepath.Join(root, "dst.txt"), "old")
	_, _, err = svc.Copy("example.com", "src.txt", "dst.txt", false)
	assertCode(t, err, 409, "file_exists")
	data, _ = os.ReadFile(filepath.Join(root, "dst.txt"))
	if string(data) != "old" {
		t.Errorf("dst.txt changed without overwrite: %q", data)
	}
	if _, _, err := svc.Copy("example.com", "src.txt", "dst.txt", true); err != nil {
		t.Fatalf("Copy overwrite: %v", err)
	}
	data, _ = os.ReadFile(filepath.Join(root, "dst.txt"))
	if string(data) != "hello" {
		t.Errorf("dst.txt = %q after overwrite, want hello", data)
	}

	// refuses
	_, _, err = svc.Copy("example.com", "missing.txt", "x.txt", false)
	assertCode(t, err, 404, "file_not_found")
	_, _, err = svc.Copy("example.com", "src.txt", "src.txt", true)
	assertCode(t, err, 400, "invalid_path")
	_, _, err = svc.Copy("example.com", "dir", "dir/inner", false)
	assertCode(t, err, 400, "invalid_path")
	_, _, err = svc.Copy("example.com", "dir", "", true)
	assertCode(t, err, 400, "invalid_path")
	_, _, err = svc.Copy("example.com", "dir/link.txt", "x.txt", false)
	assertCode(t, err, 400, "invalid_path")
	mustSymlink(t, filepath.Join(root, "dir", "a.txt"), filepath.Join(root, "dlink.txt"))
	_, _, err = svc.Copy("example.com", "src.txt", "dlink.txt", true)
	assertCode(t, err, 400, "invalid_path")

	if got := readAuditFile(t, auditDir); !strings.Contains(got, `"action":"files.copy"`) {
		t.Errorf("audit log missing files.copy")
	}
}

func TestCopyCapsV05(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustMkdir(t, filepath.Join(root, "big"))
	mustWrite(t, filepath.Join(root, "big", "f.bin"), strings.Repeat("x", 32))

	withCaps(t, 1<<30, 1)
	_, _, err := svc.Copy("example.com", "big", "big2", false)
	assertCode(t, err, 413, "too_large")
	wantNotExist(t, filepath.Join(root, "big2"))

	withCaps(t, 16, 1<<30)
	_, _, err = svc.Copy("example.com", "big", "big2", false)
	assertCode(t, err, 413, "too_large")
	wantNotExist(t, filepath.Join(root, "big2"))

	withCaps(t, 32, 2) // exactly at both caps is allowed
	if _, _, err := svc.Copy("example.com", "big", "big2", false); err != nil {
		t.Fatalf("Copy at caps: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(root, "big2", "f.bin"))
	if err != nil || len(data) != 32 {
		t.Fatalf("big2/f.bin = %d bytes, %v", len(data), err)
	}
}

func TestCompressTarGzV05(t *testing.T) {
	svc, root, auditDir := newTestService(t, false)
	mustMkdir(t, filepath.Join(root, "sub"))
	mustWrite(t, filepath.Join(root, "sub", "a.txt"), "A")
	mustWrite(t, filepath.Join(root, "top.txt"), "T")
	mustSymlink(t, filepath.Join(root, "top.txt"), filepath.Join(root, "sub", "link.txt"))

	path, err := svc.Compress("example.com", []string{"sub", "top.txt"}, "tar.gz", "out.tar.gz")
	if err != nil || path != "out.tar.gz" {
		t.Fatalf("Compress = %q, %v", path, err)
	}
	got := readTarGzEntries(t, filepath.Join(root, "out.tar.gz"))
	want := map[string]string{"sub/": "", "sub/a.txt": "A", "top.txt": "T"}
	if len(got) != len(want) {
		t.Fatalf("tar entries = %v, want %v", got, want)
	}
	for name, body := range want {
		if got[name] != body {
			t.Errorf("tar entry %q = %q, want %q", name, got[name], body)
		}
	}
	if _, ok := got["sub/link.txt"]; ok {
		t.Errorf("symlink entry was archived")
	}

	// an archive of the whole webroot never packs itself
	if _, err := svc.Compress("example.com", []string{""}, "zip", "site.zip"); err != nil {
		t.Fatalf("Compress webroot: %v", err)
	}
	if _, ok := readZipEntries(t, filepath.Join(root, "site.zip"))["site.zip"]; ok {
		t.Errorf("archive packed itself")
	}

	// errors
	_, err = svc.Compress("example.com", []string{"sub"}, "tar.gz", "out.tar.gz")
	assertCode(t, err, 409, "file_exists")
	_, err = svc.Compress("example.com", []string{"sub"}, "tar", "other.tar")
	assertCode(t, err, 400, "invalid_format")
	_, err = svc.Compress("example.com", []string{"sub", "missing.txt"}, "zip", "other.zip")
	assertCode(t, err, 404, "file_not_found")
	_, err = svc.Compress("example.com", nil, "zip", "other.zip")
	assertCode(t, err, 400, "invalid_path")
	_, err = svc.Compress("example.com", []string{"sub/link.txt"}, "zip", "other.zip")
	assertCode(t, err, 400, "invalid_path")
	_, err = svc.Compress("example.com", []string{"sub"}, "zip", "nodir/other.zip")
	assertCode(t, err, 404, "file_not_found")
	wantNotExist(t, filepath.Join(root, "other.tar"))
	wantNotExist(t, filepath.Join(root, "other.zip"))
	wantNotExist(t, filepath.Join(root, "nodir"))

	if !strings.Contains(readAuditFile(t, auditDir), `"action":"files.compress"`) {
		t.Errorf("audit log missing files.compress")
	}
}

func TestCompressZipV05(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustMkdir(t, filepath.Join(root, "sub"))
	mustWrite(t, filepath.Join(root, "sub", "a.txt"), "A")
	mustWrite(t, filepath.Join(root, "top.txt"), "T")

	if _, err := svc.Compress("example.com", []string{"sub", "top.txt"}, "zip", "out.zip"); err != nil {
		t.Fatalf("Compress zip: %v", err)
	}
	got := readZipEntries(t, filepath.Join(root, "out.zip"))
	want := map[string]string{"sub/": "", "sub/a.txt": "A", "top.txt": "T"}
	if len(got) != len(want) {
		t.Fatalf("zip entries = %v, want %v", got, want)
	}
	for name, body := range want {
		if got[name] != body {
			t.Errorf("zip entry %q = %q, want %q", name, got[name], body)
		}
	}
	// round-trip through the service extractor
	if _, err := svc.Extract("example.com", "out.zip", "roundtrip"); err != nil {
		t.Fatalf("Extract round-trip: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(root, "roundtrip", "sub", "a.txt")); err != nil || string(data) != "A" {
		t.Fatalf("roundtrip/sub/a.txt = %q, %v", data, err)
	}
}

func TestCompressCapsV05(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	mustWrite(t, filepath.Join(root, "big.bin"), strings.Repeat("x", 64))

	withCaps(t, 16, 1<<30)
	_, err := svc.Compress("example.com", []string{"big.bin"}, "zip", "x.zip")
	assertCode(t, err, 413, "too_large")
	wantNotExist(t, filepath.Join(root, "x.zip"))

	withCaps(t, 1<<30, 0)
	_, err = svc.Compress("example.com", []string{"big.bin"}, "tar.gz", "y.tar.gz")
	assertCode(t, err, 413, "too_large")
	wantNotExist(t, filepath.Join(root, "y.tar.gz"))
}

func TestExtractTarGzV05(t *testing.T) {
	svc, root, auditDir := newTestService(t, false)
	writeTarGz(t, filepath.Join(root, "arch.tar.gz"), []tarTestEntry{
		{name: "d/", mode: 0o750, typeflag: tar.TypeDir},
		{name: "d/a.txt", body: "A", mode: 0o640},
		{name: "b.txt", body: "B", mode: 0o600},
		{name: "evil", mode: 0o777, typeflag: tar.TypeSymlink, linkname: "/etc/passwd"},
	})

	dest, err := svc.Extract("example.com", "arch.tar.gz", "out")
	if err != nil || dest != "out" {
		t.Fatalf("Extract = %q, %v", dest, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "out", "d", "a.txt"))
	if err != nil || string(data) != "A" {
		t.Fatalf("out/d/a.txt = %q, %v", data, err)
	}
	mustPerm(t, filepath.Join(root, "out", "d", "a.txt"), 0o640)
	mustPerm(t, filepath.Join(root, "out", "d"), 0o755)
	if data, err := os.ReadFile(filepath.Join(root, "out", "b.txt")); err != nil || string(data) != "B" {
		t.Fatalf("out/b.txt = %q, %v", data, err)
	}
	wantNotExist(t, filepath.Join(root, "out", "evil"))

	// .tgz alias
	writeTarGz(t, filepath.Join(root, "alias.tgz"), []tarTestEntry{{name: "t.txt", body: "T", mode: 0o644}})
	if _, err := svc.Extract("example.com", "alias.tgz", "tgz-out"); err != nil {
		t.Fatalf("Extract .tgz: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(root, "tgz-out", "t.txt")); err != nil || string(data) != "T" {
		t.Fatalf("tgz-out/t.txt = %q, %v", data, err)
	}

	// errors
	_, err = svc.Extract("example.com", "missing.tar.gz", "d1")
	assertCode(t, err, 404, "file_not_found")
	_, err = svc.Extract("example.com", "out", "d2")
	assertCode(t, err, 404, "file_not_found")
	mustWrite(t, filepath.Join(root, "notes.txt"), "not an archive")
	_, err = svc.Extract("example.com", "notes.txt", "d3")
	assertCode(t, err, 400, "invalid_archive")

	// crafted traversal and absolute entries are refused
	writeTarGz(t, filepath.Join(root, "evil.tar.gz"), []tarTestEntry{{name: "../escape.txt", body: "X", mode: 0o644}})
	_, err = svc.Extract("example.com", "evil.tar.gz", "safe")
	assertCode(t, err, 400, "invalid_archive")
	wantNotExist(t, filepath.Join(root, "escape.txt"))
	writeTarGz(t, filepath.Join(root, "abs.tar.gz"), []tarTestEntry{{name: "/abs-escape.txt", body: "X", mode: 0o644}})
	_, err = svc.Extract("example.com", "abs.tar.gz", "safe")
	assertCode(t, err, 400, "invalid_archive")
	wantNotExist(t, filepath.Join(root, "abs-escape.txt"))

	if !strings.Contains(readAuditFile(t, auditDir), `"action":"files.extract"`) {
		t.Errorf("audit log missing files.extract")
	}
}

func TestExtractZipV05(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	writeZip(t, filepath.Join(root, "arch.zip"), []zipTestEntry{
		{name: "z/", mode: fs.ModeDir | 0o755},
		{name: "z/c.txt", body: "C", mode: 0o640},
		{name: "plain.txt", body: "P", plainZip: true},
		{name: "lnk", body: "/etc/passwd", mode: 0o777, symlink: true},
	})

	if _, err := svc.Extract("example.com", "arch.zip", "unzip"); err != nil {
		t.Fatalf("Extract zip: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(root, "unzip", "z", "c.txt")); err != nil || string(data) != "C" {
		t.Fatalf("unzip/z/c.txt = %q, %v", data, err)
	}
	mustPerm(t, filepath.Join(root, "unzip", "z", "c.txt"), 0o640)
	if data, err := os.ReadFile(filepath.Join(root, "unzip", "plain.txt")); err != nil || string(data) != "P" {
		t.Fatalf("unzip/plain.txt = %q, %v", data, err)
	}
	// zip entries without unix attributes surface as 0666 from the stdlib.
	mustPerm(t, filepath.Join(root, "unzip", "plain.txt"), 0o666)
	wantNotExist(t, filepath.Join(root, "unzip", "lnk"))

	// crafted traversal and absolute entries are refused
	writeZip(t, filepath.Join(root, "evil.zip"), []zipTestEntry{{name: "../zipe.txt", body: "X", mode: 0o644}})
	_, err := svc.Extract("example.com", "evil.zip", "safe2")
	assertCode(t, err, 400, "invalid_archive")
	wantNotExist(t, filepath.Join(root, "zipe.txt"))
	writeZip(t, filepath.Join(root, "abs.zip"), []zipTestEntry{{name: "/zip-abs.txt", body: "X", mode: 0o644}})
	_, err = svc.Extract("example.com", "abs.zip", "safe2")
	assertCode(t, err, 400, "invalid_archive")
	wantNotExist(t, filepath.Join(root, "zip-abs.txt"))

	// a pre-existing symlink inside dest never redirects an entry
	outside := t.TempDir()
	mustMkdir(t, filepath.Join(root, "out2"))
	mustSymlink(t, outside, filepath.Join(root, "out2", "lnk"))
	writeZip(t, filepath.Join(root, "sneaky.zip"), []zipTestEntry{{name: "lnk/pwn.txt", body: "X", mode: 0o644}})
	_, err = svc.Extract("example.com", "sneaky.zip", "out2")
	assertCode(t, err, 409, "symlink")
	wantNotExist(t, filepath.Join(outside, "pwn.txt"))
}

func TestExtractCapsV05(t *testing.T) {
	svc, root, _ := newTestService(t, false)
	body := strings.Repeat("x", 64)
	writeTarGz(t, filepath.Join(root, "big.tar.gz"), []tarTestEntry{{name: "big.bin", body: body, mode: 0o644}})
	writeZip(t, filepath.Join(root, "big.zip"), []zipTestEntry{{name: "big.bin", body: body, mode: 0o644}})

	withCaps(t, 16, 1<<30)
	_, err := svc.Extract("example.com", "big.tar.gz", "t1")
	assertCode(t, err, 413, "too_large")
	_, err = svc.Extract("example.com", "big.zip", "t2")
	assertCode(t, err, 413, "too_large")

	withCaps(t, 1<<30, 0)
	_, err = svc.Extract("example.com", "big.tar.gz", "t3")
	assertCode(t, err, 413, "too_large")
	_, err = svc.Extract("example.com", "big.zip", "t4")
	assertCode(t, err, 413, "too_large")
}

func TestV05DryRun(t *testing.T) {
	svc, root, _ := newTestService(t, true)
	mustWrite(t, filepath.Join(root, "a.txt"), "x")

	_, err := svc.Chmod("example.com", "a.txt", "755")
	assertCode(t, err, 409, "dry_run")
	_, _, err = svc.Copy("example.com", "a.txt", "b.txt", false)
	assertCode(t, err, 409, "dry_run")
	_, err = svc.Compress("example.com", []string{"a.txt"}, "zip", "t.zip")
	assertCode(t, err, 409, "dry_run")
	_, err = svc.Extract("example.com", "t.zip", "d")
	assertCode(t, err, 409, "dry_run")

	mustPerm(t, filepath.Join(root, "a.txt"), 0o644)
	wantNotExist(t, filepath.Join(root, "b.txt"))
	wantNotExist(t, filepath.Join(root, "t.zip"))
	wantNotExist(t, filepath.Join(root, "d"))
}

func TestV05SiteNotFound(t *testing.T) {
	svc, _, _ := newTestService(t, false)
	_, err := svc.Chmod("unknown.example", "x", "644")
	assertCode(t, err, 404, "site_not_found")
	_, _, err = svc.Copy("unknown.example", "a", "b", false)
	assertCode(t, err, 404, "site_not_found")
	_, err = svc.Compress("unknown.example", []string{"a"}, "zip", "t.zip")
	assertCode(t, err, 404, "site_not_found")
	_, err = svc.Extract("unknown.example", "a.zip", "d")
	assertCode(t, err, 404, "site_not_found")
}
