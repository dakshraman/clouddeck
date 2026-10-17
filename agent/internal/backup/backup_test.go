package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// harness wires the backup service to real temp dirs, a real store and the
// shared task engine, with no external services.
type harness struct {
	t        *testing.T
	svc      *Service
	st       *store.Store
	eng      *tasks.Engine
	cfg      config.Config
	stateDir string
}

func newHarness(t *testing.T, mutate func(*config.Config)) *harness {
	t.Helper()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	st, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir:      stateDir,
		Webroot:       filepath.Join(dir, "www"),
		BackupDir:     filepath.Join(dir, "backups"),
		MySQLBin:      "mysql",
		MySQLDumpBin:  "mysqldump",
		MySQLRootUser: "root",
		RcloneBin:     "rclone",
		TelegramAPI:   "https://api.telegram.org",
	}
	if mutate != nil {
		mutate(&cfg)
	}
	eng := tasks.New(st, context.Background())
	svc := New(cfg, eng, sites.New(st, eng, auditLog, cfg), auditLog)
	return &harness{t: t, svc: svc, st: st, eng: eng, cfg: cfg, stateDir: stateDir}
}

// addSite registers a site and creates its webroot.
func (h *harness) addSite(domain string) string {
	h.t.Helper()
	root := filepath.Join(h.cfg.Webroot, domain)
	if err := os.MkdirAll(root, 0o755); err != nil {
		h.t.Fatalf("create webroot: %v", err)
	}
	now := store.Now()
	site := store.Site{
		Domain: domain, Root: root, PHPVersion: "none",
		Status: store.SiteActive, CreatedAt: now, UpdatedAt: now,
	}
	if err := h.st.CreateSite(site); err != nil {
		h.t.Fatalf("CreateSite: %v", err)
	}
	return root
}

// runTask waits for the engine to drain and returns the finished task.
func (h *harness) runTask(task store.Task) store.Task {
	h.t.Helper()
	h.eng.Wait()
	got, ok := h.st.GetTask(task.ID)
	if !ok {
		h.t.Fatalf("task %s not found", task.ID)
	}
	return got
}

func (h *harness) mustCreate(req CreateRequest) store.Task {
	h.t.Helper()
	task, err := h.svc.Create(context.Background(), req)
	if err != nil {
		h.t.Fatalf("Create(%+v) = %v, want task", req, err)
	}
	return task
}

func (h *harness) mustRestore(id string) store.Task {
	h.t.Helper()
	task, err := h.svc.Restore(context.Background(), id)
	if err != nil {
		h.t.Fatalf("Restore(%q) = %v, want task", id, err)
	}
	return task
}

// wantAPIError asserts the documented status and machine code of a typed
// API error.
func wantAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %d %s", status, code)
	}
	api, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an apierr", err)
	}
	if api.Status != status || api.Code != code {
		t.Fatalf("error = %d %s, want %d %s (%v)", api.Status, api.Code, status, code, err)
	}
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s): %v", path, err)
	}
}

func mustRead(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s): %v", path, err)
	}
	return string(data)
}

// writeScript drops an executable shell script into dir.
func writeScript(t *testing.T, dir, name, body string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatalf("write script %s: %v", name, err)
	}
	return path
}

// writeTarGz builds a gzip tar archive with one regular-file entry per map
// key (used for hand-crafted restore inputs).
func writeTarGz(t *testing.T, path string, entries map[string]string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create archive: %v", err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for name, content := range entries {
		hdr := &tar.Header{Name: name, Mode: 0o644, Size: int64(len(content)), Typeflag: tar.TypeReg}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write header %q: %v", name, err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("write entry %q: %v", name, err)
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

// readGz decompresses the archive at path.
func readGz(t *testing.T, path string) string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip open %s: %v", path, err)
	}
	defer gz.Close()
	var b strings.Builder
	if _, err := io.Copy(&b, gz); err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return b.String()
}

func TestParseName(t *testing.T) {
	at := time.Unix(1700000000, 0).UTC()
	valid := []struct {
		name   string
		kind   string
		source string
	}{
		{"site-example.com-1700000000.tar.gz", KindSite, "example.com"},
		{"site-sub.example.co.uk-1700000000.tar.gz", KindSite, "sub.example.co.uk"},
		{"site-a-b.example.com-1700000000.tar.gz", KindSite, "a-b.example.com"},
		{"site-example.123-1700000000.tar.gz", KindSite, "example.123"},
		{"database-shop_db-1700000000.sql.gz", KindDatabase, "shop_db"},
	}
	for _, tc := range valid {
		got, ok := parseName(tc.name)
		if !ok {
			t.Errorf("parseName(%q) failed, want valid", tc.name)
			continue
		}
		if got.kind != tc.kind || got.source != tc.source || !got.at.Equal(at) {
			t.Errorf("parseName(%q) = %+v, want kind=%s source=%s at=%s", tc.name, got, tc.kind, tc.source, at)
		}
	}

	invalid := []string{
		"",
		"random.txt",
		"site-.tar.gz",
		"site-example.com.tar.gz",
		"site-example.com-abc.tar.gz",
		"site-example.com-1700000000.tar.gz.bak",
		"database-mysql-1700000000.sql.gz",    // system schema
		"database-bad-name-1700000000.sql.gz", // not an identifier
		"database-shopdb.tar.gz",              // wrong suffix
	}
	for _, name := range invalid {
		if _, ok := parseName(name); ok {
			t.Errorf("parseName(%q) = valid, want rejected", name)
		}
	}
}

func TestListGetPathDelete(t *testing.T) {
	h := newHarness(t, nil)

	list, err := h.svc.List()
	if err != nil || len(list) != 0 {
		t.Fatalf("List on missing dir = %v, %d archives, want empty", err, len(list))
	}

	write := func(name, data string) {
		t.Helper()
		mustWrite(t, filepath.Join(h.cfg.BackupDir, name), data)
	}
	write("site-example.com-1000.tar.gz", "site-1000")
	write("database-shopdb-1001.sql.gz", "db-1001-bytes")
	write("random.txt", "x")
	write("site-EXAMPLE.com-1002.tar.gz", "x")
	write("site-example.com-notaunix.tar.gz", "x")
	write("database-mysql-1003.sql.gz", "x")

	list, err = h.svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("List returned %d archives, want 2: %+v", len(list), list)
	}
	if list[0].ID != "database-shopdb-1001.sql.gz" || list[1].ID != "site-example.com-1000.tar.gz" {
		t.Errorf("List order = [%s %s], want newest first", list[0].ID, list[1].ID)
	}
	if list[0].Kind != KindDatabase || list[0].Source != "shopdb" || list[0].SizeBytes != int64(len("db-1001-bytes")) {
		t.Errorf("database row = %+v", list[0])
	}
	if !list[0].CreatedAt.Equal(time.Unix(1001, 0).UTC()) || !list[1].CreatedAt.Equal(time.Unix(1000, 0).UTC()) {
		t.Errorf("createdAt = %s / %s, want the epochs encoded in the names", list[0].CreatedAt, list[1].CreatedAt)
	}

	id := "site-example.com-1000.tar.gz"
	archive, err := h.svc.Get(id)
	if err != nil {
		t.Fatalf("Get(%q): %v", id, err)
	}
	if archive.Kind != KindSite || archive.Source != "example.com" || archive.SizeBytes != int64(len("site-1000")) {
		t.Errorf("Get(%q) = %+v", id, archive)
	}
	p, err := h.svc.Path(id)
	if err != nil {
		t.Fatalf("Path(%q): %v", id, err)
	}
	if p != filepath.Join(h.cfg.BackupDir, id) {
		t.Errorf("Path(%q) = %q", id, p)
	}

	for _, bad := range []string{"", "../etc/passwd", "site-UPPER.com-1.tar.gz", "missing-1.tar.gz", "..", "a/b"} {
		if _, err := h.svc.Get(bad); err == nil {
			t.Errorf("Get(%q) = nil, want invalid_id", bad)
		} else {
			wantAPIError(t, err, 400, "invalid_id")
		}
	}
	if _, err := h.svc.Get("site-nope.com-1000.tar.gz"); err == nil {
		t.Error("Get on regex-valid but missing archive = nil, want backup_not_found")
	} else {
		wantAPIError(t, err, 404, "backup_not_found")
	}

	if err := h.svc.Delete(id); err != nil {
		t.Fatalf("Delete(%q): %v", id, err)
	}
	if _, err := os.Lstat(filepath.Join(h.cfg.BackupDir, id)); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("archive still on disk after Delete: %v", err)
	}
	if err := h.svc.Delete(id); err == nil {
		t.Error("Delete of missing archive = nil, want backup_not_found")
	} else {
		wantAPIError(t, err, 404, "backup_not_found")
	}

	auditData := mustRead(t, filepath.Join(h.stateDir, "audit.log"))
	if !strings.Contains(auditData, `"action":"backup.delete"`) || !strings.Contains(auditData, `"result":"accepted"`) {
		t.Errorf("audit log misses the accepted delete record:\n%s", auditData)
	}
	if !strings.Contains(auditData, `"result":"rejected"`) {
		t.Errorf("audit log misses the rejected delete record:\n%s", auditData)
	}
}

func TestDryRun(t *testing.T) {
	h := newHarness(t, func(cfg *config.Config) { cfg.DryRun = true })
	ctx := context.Background()

	if _, err := h.svc.Create(ctx, CreateRequest{Kind: KindSite, Site: "example.com"}); err == nil {
		t.Error("Create in dry-run = nil, want dry_run")
	} else {
		wantAPIError(t, err, 409, "dry_run")
	}
	if _, err := h.svc.Restore(ctx, "site-example.com-1000.tar.gz"); err == nil {
		t.Error("Restore in dry-run = nil, want dry_run")
	} else {
		wantAPIError(t, err, 409, "dry_run")
	}
	if err := h.svc.Delete("site-example.com-1000.tar.gz"); err == nil {
		t.Error("Delete in dry-run = nil, want dry_run")
	} else {
		wantAPIError(t, err, 409, "dry_run")
	}
}

func TestSiteCreateRestoreRoundTrip(t *testing.T) {
	h := newHarness(t, nil)
	root := h.addSite("example.com")
	mustWrite(t, filepath.Join(root, "index.html"), "hello")
	mustWrite(t, filepath.Join(root, "assets", "app.css"), "body{}")
	if err := os.Symlink("/etc/passwd", filepath.Join(root, "passwd-link")); err != nil {
		t.Fatalf("create symlink: %v", err)
	}

	task := h.runTask(h.mustCreate(CreateRequest{Kind: KindSite, Site: "example.com"}))
	if task.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s, error %v", task.Status, task.Error)
	}

	list, err := h.svc.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %v, %d archives, want one", err, len(list))
	}
	archive := list[0]
	if archive.Kind != KindSite || archive.Source != "example.com" || archive.SizeBytes == 0 {
		t.Fatalf("archive = %+v", archive)
	}
	if !strings.HasPrefix(archive.ID, "site-example.com-") || !strings.HasSuffix(archive.ID, ".tar.gz") {
		t.Fatalf("archive id = %q", archive.ID)
	}

	// Wipe the webroot, then restore: everything must come back, and the
	// symlink skipped at backup time must not reappear.
	if err := os.RemoveAll(root); err != nil {
		t.Fatalf("RemoveAll: %v", err)
	}
	restore := h.runTask(h.mustRestore(archive.ID))
	if restore.Status != store.TaskSucceeded {
		t.Fatalf("restore task = %s, error %v", restore.Status, restore.Error)
	}
	if got := mustRead(t, filepath.Join(root, "index.html")); got != "hello" {
		t.Errorf("index.html = %q, want %q", got, "hello")
	}
	if got := mustRead(t, filepath.Join(root, "assets", "app.css")); got != "body{}" {
		t.Errorf("app.css = %q, want %q", got, "body{}")
	}
	if _, err := os.Lstat(filepath.Join(root, "passwd-link")); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("restore recreated the skipped symlink: %v", err)
	}

	// Overwriting existing files must work too.
	mustWrite(t, filepath.Join(root, "index.html"), "changed")
	restore = h.runTask(h.mustRestore(archive.ID))
	if restore.Status != store.TaskSucceeded {
		t.Fatalf("second restore task = %s, error %v", restore.Status, restore.Error)
	}
	if got := mustRead(t, filepath.Join(root, "index.html")); got != "hello" {
		t.Errorf("index.html after overwrite = %q, want %q", got, "hello")
	}
}

func TestRestoreRejectsUnsafeEntries(t *testing.T) {
	h := newHarness(t, nil)
	root := h.addSite("example.com")
	outside := filepath.Join(filepath.Dir(root), "evil.txt")

	id := "site-example.com-1700000000.tar.gz"
	writeTarGz(t, filepath.Join(h.cfg.BackupDir, id), map[string]string{
		"ok.txt":      "fine",
		"../evil.txt": "boom",
	})

	task := h.runTask(h.mustRestore(id))
	if task.Status != store.TaskFailed {
		t.Fatalf("restore task = %s, want failed", task.Status)
	}
	if task.Error == nil || !strings.Contains(*task.Error, "unsafe name") {
		t.Errorf("task error = %v, want an unsafe-name rejection", task.Error)
	}
	if _, err := os.Stat(outside); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("traversal entry escaped the webroot: %v", err)
	}
}

func TestRestoreSiteNotFound(t *testing.T) {
	h := newHarness(t, nil)
	id := "site-gone.example.com-1700000000.tar.gz"
	writeTarGz(t, filepath.Join(h.cfg.BackupDir, id), map[string]string{"index.html": "x"})
	_, err := h.svc.Restore(context.Background(), id)
	wantAPIError(t, err, 404, "site_not_found")
}

func TestCreateValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	ctx := context.Background()

	cases := []struct {
		name string
		req  CreateRequest
		code string
	}{
		{"unknown kind", CreateRequest{Kind: "files"}, "invalid_request"},
		{"missing site", CreateRequest{Kind: KindSite}, "invalid_request"},
		{"missing database", CreateRequest{Kind: KindDatabase}, "invalid_request"},
		{"invalid site", CreateRequest{Kind: KindSite, Site: "no_tld"}, "invalid_request"},
		{"invalid database", CreateRequest{Kind: KindDatabase, Database: "bad-name"}, "invalid_request"},
		{"system schema", CreateRequest{Kind: KindDatabase, Database: "mysql"}, "invalid_request"},
		{"unknown upload", CreateRequest{Kind: KindSite, Site: "example.com", Uploads: []UploadTarget{{Type: "dropbox"}}}, "invalid_request"},
		{"rclone remote without colon", CreateRequest{Kind: KindSite, Site: "example.com", Uploads: []UploadTarget{{Type: "rclone", Remote: "gdrive"}}}, "invalid_request"},
		{"rclone remote empty", CreateRequest{Kind: KindSite, Site: "example.com", Uploads: []UploadTarget{{Type: "rclone"}}}, "invalid_request"},
		{"telegram not configured", CreateRequest{Kind: KindSite, Site: "example.com", Uploads: []UploadTarget{{Type: "telegram"}}}, "telegram_not_configured"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status := 400
			if tc.code == "telegram_not_configured" {
				status = 412
			}
			_, err := h.svc.Create(ctx, tc.req)
			wantAPIError(t, err, status, tc.code)
		})
	}

	_, err := h.svc.Create(ctx, CreateRequest{Kind: KindSite, Site: "nope.example.com"})
	wantAPIError(t, err, 404, "site_not_found")
}

func TestDatabaseCreateRestoreWithFakeClient(t *testing.T) {
	dir := t.TempDir()
	capture := filepath.Join(dir, "restored.sql")
	fakeMySQL := writeScript(t, dir, "mysql", "#! /bin/sh\n"+
		"case \"$*\" in\n"+
		"  *\"SHOW DATABASES\"*) echo information_schema; echo MyDB ;;\n"+
		"  *) cat > '"+capture+"' ;;\n"+
		"esac\n")
	fakeDump := writeScript(t, dir, "mysqldump", "#! /bin/sh\n"+
		"echo \"dump-args: $*\"\n"+
		"echo \"MYSQL_PWD=${MYSQL_PWD:-unset}\"\n"+
		"echo 'SELECT 1;'\n")

	h := newHarness(t, func(cfg *config.Config) {
		cfg.MySQLBin = fakeMySQL
		cfg.MySQLDumpBin = fakeDump
		cfg.MySQLRootPass = "secret"
	})

	// The request uses lowercase; the server's spelling is MyDB.
	task := h.runTask(h.mustCreate(CreateRequest{Kind: KindDatabase, Database: "mydb"}))
	if task.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s, error %v", task.Status, task.Error)
	}
	if task.Site != "MyDB" {
		t.Errorf("task site = %q, want the server's spelling %q", task.Site, "MyDB")
	}

	list, err := h.svc.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %v, %d archives, want one", err, len(list))
	}
	archive := list[0]
	if archive.Kind != KindDatabase || archive.Source != "mydb" {
		t.Fatalf("archive = %+v", archive)
	}
	if !strings.HasPrefix(archive.ID, "database-mydb-") || !strings.HasSuffix(archive.ID, ".sql.gz") {
		t.Fatalf("archive id = %q", archive.ID)
	}

	path, err := h.svc.Path(archive.ID)
	if err != nil {
		t.Fatalf("Path: %v", err)
	}
	dump := readGz(t, path)
	for _, want := range []string{"-u root", "MyDB", "MYSQL_PWD=secret", "SELECT 1;"} {
		if !strings.Contains(dump, want) {
			t.Errorf("dump misses %q:\n%s", want, dump)
		}
	}
	if strings.Contains(dump, "--databases") {
		t.Errorf("dump must not use --databases:\n%s", dump)
	}
	if !strings.Contains(dump, "--skip-add-drop-table") {
		t.Errorf("dump must not drop existing tables on restore:\n%s", dump)
	}

	restore := h.runTask(h.mustRestore(archive.ID))
	if restore.Status != store.TaskSucceeded {
		t.Fatalf("restore task = %s, error %v", restore.Status, restore.Error)
	}
	if got := mustRead(t, capture); got != dump {
		t.Errorf("client stdin = %q, want the dump %q", got, dump)
	}
}

func TestCreateDatabaseNotFound(t *testing.T) {
	dir := t.TempDir()
	fakeMySQL := writeScript(t, dir, "mysql", "#! /bin/sh\necho information_schema\n")
	h := newHarness(t, func(cfg *config.Config) { cfg.MySQLBin = fakeMySQL })

	_, err := h.svc.Create(context.Background(), CreateRequest{Kind: KindDatabase, Database: "nope"})
	wantAPIError(t, err, 404, "database_not_found")
}

func TestRestoreDatabaseNotFound(t *testing.T) {
	dir := t.TempDir()
	fakeMySQL := writeScript(t, dir, "mysql", "#! /bin/sh\necho information_schema\n")
	h := newHarness(t, func(cfg *config.Config) { cfg.MySQLBin = fakeMySQL })

	id := "database-gone-1700000000.sql.gz"
	writeTarGz(t, filepath.Join(h.cfg.BackupDir, id), map[string]string{"dump.sql": "SELECT 1;"})
	_, err := h.svc.Restore(context.Background(), id)
	wantAPIError(t, err, 404, "database_not_found")
}

func TestUploadsTelegram(t *testing.T) {
	type telegramRequest struct {
		path string
		chat string
		file []byte
	}
	requests := make(chan telegramRequest, 1)
	ok := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !ok {
			fmt.Fprint(w, `{"ok":false,"description":"chat not found"}`)
			return
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("document")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		data, _ := io.ReadAll(file)
		requests <- telegramRequest{path: r.URL.Path, chat: r.FormValue("chat_id"), file: data}
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer srv.Close()

	h := newHarness(t, func(cfg *config.Config) {
		cfg.TelegramBotToken = "TOKEN"
		cfg.TelegramChatID = "42"
		cfg.TelegramAPI = srv.URL
	})
	root := h.addSite("example.com")
	mustWrite(t, filepath.Join(root, "index.html"), "hello")

	task := h.runTask(h.mustCreate(CreateRequest{
		Kind: KindSite, Site: "example.com",
		Uploads: []UploadTarget{{Type: "telegram"}},
	}))
	if task.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s, error %v", task.Status, task.Error)
	}
	list, err := h.svc.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %v, %d archives, want one", err, len(list))
	}
	path, err := h.svc.Path(list[0].ID)
	if err != nil {
		t.Fatalf("Path: %v", err)
	}
	sent := <-requests
	if sent.path != "/botTOKEN/sendDocument" {
		t.Errorf("telegram path = %q", sent.path)
	}
	if sent.chat != "42" {
		t.Errorf("telegram chat_id = %q, want %q", sent.chat, "42")
	}
	if string(sent.file) != mustRead(t, path) {
		t.Error("telegram document differs from the local archive")
	}

	// A rejected Telegram upload fails the task but keeps the archive.
	ok = false
	task = h.runTask(h.mustCreate(CreateRequest{
		Kind: KindSite, Site: "example.com",
		Uploads: []UploadTarget{{Type: "telegram"}},
	}))
	if task.Status != store.TaskFailed {
		t.Fatalf("create task = %s, want failed", task.Status)
	}
	if task.Error == nil || !strings.Contains(*task.Error, "chat not found") {
		t.Errorf("task error = %v, want the Telegram description", task.Error)
	}
	list, err = h.svc.List()
	if err != nil || len(list) == 0 {
		t.Fatalf("List = %v, %d archives, want the local archives kept", err, len(list))
	}
}

func TestUploadsRclone(t *testing.T) {
	dir := t.TempDir()
	capture := filepath.Join(dir, "rclone-args")
	script := writeScript(t, dir, "rclone", "#! /bin/sh\nprintf '%s\\n' \"$@\" > '"+capture+"'\n")
	h := newHarness(t, func(cfg *config.Config) { cfg.RcloneBin = script })
	root := h.addSite("example.com")
	mustWrite(t, filepath.Join(root, "index.html"), "hello")

	task := h.runTask(h.mustCreate(CreateRequest{
		Kind: KindSite, Site: "example.com",
		Uploads: []UploadTarget{{Type: "rclone", Remote: "gdrive:clouddeck/backups"}},
	}))
	if task.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s, error %v", task.Status, task.Error)
	}
	list, err := h.svc.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List = %v, %d archives, want one", err, len(list))
	}
	path, err := h.svc.Path(list[0].ID)
	if err != nil {
		t.Fatalf("Path: %v", err)
	}
	got := strings.Split(strings.TrimSpace(mustRead(t, capture)), "\n")
	want := []string{"copy", path, "gdrive:clouddeck/backups"}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Errorf("rclone args = %q, want %q", got, want)
	}

	// A failing rclone fails the task but keeps the archive.
	failing := filepath.Join(dir, "rclone-fail")
	writeScript(t, dir, "rclone-fail", "#! /bin/sh\nexit 3\n")
	h2 := newHarness(t, func(cfg *config.Config) { cfg.RcloneBin = failing })
	root2 := h2.addSite("example.com")
	mustWrite(t, filepath.Join(root2, "index.html"), "hello")
	task = h2.runTask(h2.mustCreate(CreateRequest{
		Kind: KindSite, Site: "example.com",
		Uploads: []UploadTarget{{Type: "rclone", Remote: "gdrive:backups"}},
	}))
	if task.Status != store.TaskFailed {
		t.Fatalf("create task = %s, want failed", task.Status)
	}
	list, err = h2.svc.List()
	if err != nil || len(list) != 1 {
		t.Fatalf("List after failed upload = %v, %d archives, want the local archive kept", err, len(list))
	}
}
