package ftp

import (
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// env is one FTP service whose every path lives under a temp dir.
type env struct {
	t        *testing.T
	cfg      config.Config
	svc      *Service
	auditLog *audit.Log
	auditDir string
}

// newEnv builds an isolated environment: the passwd file lives under
// t.TempDir() and accounts are owned by the current user, so chown-to-self
// works without root.
func newEnv(t *testing.T) *env {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("FTP homes require a POSIX host")
	}
	root := t.TempDir()
	current, err := user.Current()
	if err != nil {
		t.Fatalf("user.Current: %v", err)
	}
	cfg := config.Config{
		StateDir:      filepath.Join(root, "state"),
		FTPPasswdFile: filepath.Join(root, "state", "ftp", "passwd"),
		FTPRunAs:      current.Username,
	}
	auditLog, err := audit.Open(cfg.StateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return &env{t: t, cfg: cfg, svc: New(cfg, auditLog), auditLog: auditLog, auditDir: cfg.StateDir}
}

// rebuild recreates the service after cfg changed.
func (e *env) rebuild() {
	e.svc = New(e.cfg, e.auditLog)
}

// currentIDs returns the uid/gid of the user the tests run as.
func currentIDs(t *testing.T) (int, int) {
	t.Helper()
	current, err := user.Current()
	if err != nil {
		t.Fatalf("user.Current: %v", err)
	}
	uid, err := strconv.Atoi(current.Uid)
	if err != nil {
		t.Fatalf("uid %q: %v", current.Uid, err)
	}
	gid, err := strconv.Atoi(current.Gid)
	if err != nil {
		t.Fatalf("gid %q: %v", current.Gid, err)
	}
	return uid, gid
}

// assertAPIErr asserts err is an *apierr.Error with the wanted status/code.
func assertAPIErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s (%q), want %d/%s", apiErr.Status, apiErr.Code, apiErr.Message, status, code)
	}
}

// readFile reads a file, failing the test when it is missing.
func (e *env) readFile(path string) string {
	e.t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		e.t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

// readFileOrEmpty reads a file, returning "" when it does not exist.
func (e *env) readFileOrEmpty(path string) string {
	e.t.Helper()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return ""
	}
	if err != nil {
		e.t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

// assertAuditContains fails when the audit log lacks any of wants.
func (e *env) assertAuditContains(wants ...string) {
	e.t.Helper()
	text := e.readFileOrEmpty(filepath.Join(e.auditDir, "audit.log"))
	for _, want := range wants {
		if !strings.Contains(text, want) {
			e.t.Fatalf("audit log lacks %q:\n%s", want, text)
		}
	}
}

// assertAuditLacks fails when the audit log contains any of lacks.
func (e *env) assertAuditLacks(lacks ...string) {
	e.t.Helper()
	text := e.readFileOrEmpty(filepath.Join(e.auditDir, "audit.log"))
	for _, lack := range lacks {
		if strings.Contains(text, lack) {
			e.t.Fatalf("audit log must not contain %q:\n%s", lack, text)
		}
	}
}

// shQuote wraps s in single quotes for POSIX sh.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// writeStub writes a small POSIX shell script and returns its path.
func writeStub(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "stub.sh")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatalf("write stub: %v", err)
	}
	return path
}

// hashOfLine extracts the hash field from a one-line passwd file.
func hashOfLine(t *testing.T, content string) string {
	t.Helper()
	fields := strings.Split(strings.TrimSpace(content), ":")
	if len(fields) != 7 {
		t.Fatalf("passwd line %q does not have 7 fields", content)
	}
	return fields[1]
}

// verifyHash recomputes hash with its embedded salt and fails when it does
// not match password.
func verifyHash(t *testing.T, hash, password string) {
	t.Helper()
	prefix := hash[:strings.LastIndexByte(hash, '$')+1]
	if got := sha512Crypt(password, prefix); got != hash {
		t.Fatalf("hash %q does not verify password %q (got %q)", hash, password, got)
	}
}

func TestListMissingFileIsEmpty(t *testing.T) {
	e := newEnv(t)
	accounts, err := e.svc.List()
	if err != nil || len(accounts) != 0 {
		t.Fatalf("List = %v, %v, want empty", accounts, err)
	}
	status := e.svc.Status()
	if status.PasswdFile != e.cfg.FTPPasswdFile || status.RunAs != e.cfg.FTPRunAs || status.Accounts != 0 {
		t.Fatalf("Status = %+v", status)
	}
}

func TestCreateListDeleteRoundtrip(t *testing.T) {
	e := newEnv(t)
	siteRoot := filepath.Join(t.TempDir(), "www", "example.com")

	account, err := e.svc.Create(siteRoot, "files", "deploy", "correct-horse")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	uid, gid := currentIDs(t)
	home := filepath.Join(siteRoot, "files")
	if account.Name != "deploy" || account.Home != home || account.UID != uid || account.GID != gid {
		t.Fatalf("account = %+v, want deploy %s %d:%d", account, home, uid, gid)
	}

	// The home was created with the frozen mode.
	info, err := os.Stat(home)
	if err != nil || !info.IsDir() {
		t.Fatalf("home %s: %v", home, err)
	}
	if perm := info.Mode().Perm(); perm != 0o755 {
		t.Fatalf("home mode = %o, want 755", perm)
	}

	// The passwd file has the frozen mode and exactly one frozen line.
	passwdInfo, err := os.Stat(e.cfg.FTPPasswdFile)
	if err != nil {
		t.Fatalf("stat passwd file: %v", err)
	}
	if perm := passwdInfo.Mode().Perm(); perm != 0o644 {
		t.Fatalf("passwd mode = %o, want 644", perm)
	}
	content := e.readFile(e.cfg.FTPPasswdFile)
	lines := strings.Split(strings.TrimRight(content, "\n"), "\n")
	if len(lines) != 1 {
		t.Fatalf("passwd file = %q, want one line", content)
	}
	fields := strings.Split(lines[0], ":")
	if len(fields) != 7 {
		t.Fatalf("passwd line %q has %d fields, want 7 (login:hash:uid:gid:gecos:home:shell)", lines[0], len(fields))
	}
	if fields[0] != "deploy" || fields[2] != strconv.Itoa(uid) || fields[3] != strconv.Itoa(gid) || fields[5] != home {
		t.Fatalf("passwd line = %q, want login/uid/gid/home filled in", lines[0])
	}
	if fields[4] != "" || fields[6] != "" {
		t.Fatalf("gecos and shell must be empty: %q", lines[0])
	}
	if !hashRe.MatchString(fields[1]) {
		t.Fatalf("hash %q is not a $6$ SHA-512 crypt hash", fields[1])
	}
	verifyHash(t, fields[1], "correct-horse")

	// List returns the account and Status counts it.
	accounts, err := e.svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(accounts) != 1 || accounts[0] != account {
		t.Fatalf("List = %+v, want %+v", accounts, account)
	}
	status := e.svc.Status()
	if status.PasswdFile != e.cfg.FTPPasswdFile || status.RunAs != e.cfg.FTPRunAs || status.Accounts != 1 {
		t.Fatalf("Status = %+v", status)
	}

	// Delete drops the line but keeps the home directory.
	if err := e.svc.Delete("deploy"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if accounts, err := e.svc.List(); err != nil || len(accounts) != 0 {
		t.Fatalf("List after delete = %+v, %v", accounts, err)
	}
	if _, err := os.Stat(home); err != nil {
		t.Fatalf("home must be kept after delete: %v", err)
	}
	if content := e.readFile(e.cfg.FTPPasswdFile); content != "" {
		t.Fatalf("passwd file after delete = %q, want empty", content)
	}
	assertAPIErr(t, e.svc.Delete("deploy"), 404, "ftp_user_not_found")

	e.assertAuditContains(`"action":"ftp.create"`, `"action":"ftp.delete"`, `"result":"accepted"`)
	e.assertAuditLacks("correct-horse")
}

func TestCreateEmptySubdirUsesSiteRoot(t *testing.T) {
	e := newEnv(t)
	siteRoot := filepath.Join(t.TempDir(), "site")
	account, err := e.svc.Create(siteRoot, "", "deploy", "correct-horse")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if account.Home != siteRoot {
		t.Fatalf("home = %q, want the site root %q", account.Home, siteRoot)
	}
	if info, err := os.Stat(siteRoot); err != nil || !info.IsDir() {
		t.Fatalf("site root %s: %v", siteRoot, err)
	}
}

func TestCreateDuplicate(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	if _, err := e.svc.Create(siteRoot, "one", "deploy", "correct-horse"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	_, err := e.svc.Create(siteRoot, "two", "deploy", "correct-horse")
	assertAPIErr(t, err, 409, "ftp_user_exists")

	accounts, err := e.svc.List()
	if err != nil || len(accounts) != 1 || accounts[0].Home != filepath.Join(siteRoot, "one") {
		t.Fatalf("List after duplicate = %+v, %v", accounts, err)
	}
	e.assertAuditContains(`"action":"ftp.create"`, `"result":"rejected"`)
}

func TestCreateInvalidName(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	invalid := []string{
		"",
		"a",      // shorter than 2 characters
		"-dash",  // must start alphanumeric
		".dot",   // must start alphanumeric
		"_under", // must start alphanumeric
		"has space",
		"has/slash",
		"has:colon",
		"h\u00e4llo",            // non-ASCII
		strings.Repeat("a", 34), // longer than 33 characters
	}
	for i, name := range invalid {
		t.Run(fmt.Sprintf("case_%d", i), func(t *testing.T) {
			if _, err := e.svc.Create(siteRoot, "", name, "correct-horse"); err == nil {
				t.Fatalf("Create(%q) must fail", name)
			} else {
				assertAPIErr(t, err, 400, "invalid_name")
			}
		})
	}
	if _, err := os.Stat(e.cfg.FTPPasswdFile); !os.IsNotExist(err) {
		t.Fatalf("invalid names must not touch the passwd file: %v", err)
	}

	// The boundary names are accepted: 2 and 33 characters, mixed classes.
	for _, name := range []string{"ab", "a.b_c-d@e", strings.Repeat("a", 33)} {
		if _, err := e.svc.Create(siteRoot, "", name, "correct-horse"); err != nil {
			t.Fatalf("Create(%q): %v", name, err)
		}
	}
}

func TestCreateInvalidPassword(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	if _, err := e.svc.Create(siteRoot, "", "deploy", "1234567"); err == nil {
		t.Fatal("7-character password must fail")
	} else {
		assertAPIErr(t, err, 400, "invalid_password")
	}
	if _, err := os.Stat(e.cfg.FTPPasswdFile); !os.IsNotExist(err) {
		t.Fatalf("invalid passwords must not touch the passwd file: %v", err)
	}
	if _, err := e.svc.Create(siteRoot, "", "deploy", "12345678"); err != nil {
		t.Fatalf("8-character password must be accepted: %v", err)
	}
}

func TestCreateInvalidPath(t *testing.T) {
	e := newEnv(t)
	siteRoot := filepath.Join(t.TempDir(), "site")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	invalid := []string{"..", "../evil", "a/../../evil", "a/b/../../../evil", "/abs", "/../../evil"}
	for i, subdir := range invalid {
		t.Run(fmt.Sprintf("case_%d", i), func(t *testing.T) {
			if _, err := e.svc.Create(siteRoot, subdir, "deploy", "correct-horse"); err == nil {
				t.Fatalf("Create with subdir %q must fail", subdir)
			} else {
				assertAPIErr(t, err, 400, "invalid_path")
			}
		})
	}
	if _, err := os.Stat(e.cfg.FTPPasswdFile); !os.IsNotExist(err) {
		t.Fatalf("escape attempts must not touch the passwd file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(siteRoot), "evil")); !os.IsNotExist(err) {
		t.Fatal("an escape attempt created a directory outside the site root")
	}
	e.assertAuditContains(`"action":"ftp.create"`, `"result":"rejected"`)

	// Legitimate relative subdirs are cleaned and stay inside the root.
	account, err := e.svc.Create(siteRoot, "a/./b/../c", "deploy", "correct-horse")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if want := filepath.Join(siteRoot, "a", "c"); account.Home != want {
		t.Fatalf("home = %q, want %q", account.Home, want)
	}
}

func TestCreateUnknownRunAs(t *testing.T) {
	e := newEnv(t)
	e.cfg.FTPRunAs = "clouddeck-user-that-does-not-exist"
	e.rebuild()
	_, err := e.svc.Create(t.TempDir(), "", "deploy", "correct-horse")
	apiErr, ok := apierr.As(err)
	if !ok || apiErr.Status != 500 || apiErr.Code != "internal" {
		t.Fatalf("Create with unknown runAs = %v, want 500/internal", err)
	}
	if _, err := os.Stat(e.cfg.FTPPasswdFile); !os.IsNotExist(err) {
		t.Fatalf("unknown runAs must not touch the passwd file: %v", err)
	}
	e.assertAuditContains(`"action":"ftp.create"`, `"result":"rejected"`)
}

func TestSetPassword(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	if _, err := e.svc.Create(siteRoot, "files", "deploy", "first-password"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	before := e.readFile(e.cfg.FTPPasswdFile)
	firstHash := hashOfLine(t, before)
	verifyHash(t, firstHash, "first-password")

	if err := e.svc.SetPassword("deploy", "second-password"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	after := e.readFile(e.cfg.FTPPasswdFile)
	secondHash := hashOfLine(t, after)
	if secondHash == firstHash {
		t.Fatal("SetPassword must change the hash")
	}
	if !hashRe.MatchString(secondHash) {
		t.Fatalf("hash %q is not a $6$ SHA-512 crypt hash", secondHash)
	}
	verifyHash(t, secondHash, "second-password")

	// Only the hash field changed.
	beforeFields := strings.Split(strings.TrimSpace(before), ":")
	afterFields := strings.Split(strings.TrimSpace(after), ":")
	beforeFields[1], afterFields[1] = "", ""
	if strings.Join(beforeFields, ":") != strings.Join(afterFields, ":") {
		t.Fatalf("SetPassword changed more than the hash:\n%q\n%q", before, after)
	}

	// Missing users and short passwords are refused without a rewrite.
	assertAPIErr(t, e.svc.SetPassword("nobody", "second-password"), 404, "ftp_user_not_found")
	assertAPIErr(t, e.svc.SetPassword("deploy", "short"), 400, "invalid_password")
	if got := e.readFile(e.cfg.FTPPasswdFile); got != after {
		t.Fatal("a refused SetPassword must not rewrite the passwd file")
	}

	e.assertAuditContains(`"action":"ftp.password"`, `"result":"accepted"`, `"result":"rejected"`)
	e.assertAuditLacks("first-password", "second-password")
}

func TestListSortedByLogin(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	for _, name := range []string{"zeta", "alpha", "mike"} {
		if _, err := e.svc.Create(siteRoot, name, name, "correct-horse"); err != nil {
			t.Fatalf("Create(%s): %v", name, err)
		}
	}
	accounts, err := e.svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	names := make([]string, 0, len(accounts))
	for _, account := range accounts {
		names = append(names, account.Name)
	}
	if want := []string{"alpha", "mike", "zeta"}; !reflect.DeepEqual(names, want) {
		t.Fatalf("names = %v, want %v", names, want)
	}
}

func TestRewritePreservesForeignLines(t *testing.T) {
	e := newEnv(t)
	if err := os.MkdirAll(filepath.Dir(e.cfg.FTPPasswdFile), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	foreign := "# managed by hand\n" +
		"guest:$6$abcdefghijklmnop$" + strings.Repeat("x", 86) + ":1000:1000::/srv/guest:"
	if err := os.WriteFile(e.cfg.FTPPasswdFile, []byte(foreign+"\n"), 0o644); err != nil {
		t.Fatalf("seed passwd file: %v", err)
	}

	if _, err := e.svc.Create(t.TempDir(), "", "deploy", "correct-horse"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	content := e.readFile(e.cfg.FTPPasswdFile)
	if !strings.Contains(content, foreign) {
		t.Fatalf("foreign lines were not preserved:\n%s", content)
	}
	accounts, err := e.svc.List()
	if err != nil || len(accounts) != 2 {
		t.Fatalf("List = %+v, %v, want the guest and deploy accounts", accounts, err)
	}
	if accounts[0].Name != "deploy" || accounts[1].Name != "guest" {
		t.Fatalf("accounts = %+v, want deploy then guest", accounts)
	}

	if err := e.svc.SetPassword("guest", "guest-password"); err != nil {
		t.Fatalf("SetPassword(guest): %v", err)
	}
	if content := e.readFile(e.cfg.FTPPasswdFile); !strings.Contains(content, "# managed by hand") {
		t.Fatalf("comment was not preserved:\n%s", content)
	}
	if err := e.svc.Delete("deploy"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if content := e.readFile(e.cfg.FTPPasswdFile); !strings.Contains(content, "guest:") {
		t.Fatalf("guest account was not preserved:\n%s", content)
	}
}

func TestConcurrentCreates(t *testing.T) {
	e := newEnv(t)
	siteRoot := t.TempDir()
	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := fmt.Sprintf("user%d", i)
			_, errs[i] = e.svc.Create(siteRoot, name, name, "correct-horse")
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("Create(user%d): %v", i, err)
		}
	}
	accounts, err := e.svc.List()
	if err != nil || len(accounts) != 4 {
		t.Fatalf("List = %+v, %v, want 4 accounts", accounts, err)
	}
}

func TestReloadCommandRunsAndFailuresAreLogged(t *testing.T) {
	e := newEnv(t)
	marker := filepath.Join(t.TempDir(), "marker.txt")
	// The stub records its argv into the marker file.
	stub := writeStub(t, "echo \"$@\" >> "+shQuote(marker)+"\n")
	e.cfg.FTPReloadCmd = stub + " ftp.reload"
	e.rebuild()
	if _, err := e.svc.Create(t.TempDir(), "", "user1", "password-1"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if data, err := os.ReadFile(marker); err != nil || strings.TrimSpace(string(data)) != "ftp.reload" {
		t.Fatalf("reload not invoked: %q, %v", data, err)
	}

	// Every successful mutation triggers the reload.
	if err := e.svc.Delete("user1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if data, err := os.ReadFile(marker); err != nil || strings.Count(string(data), "ftp.reload") != 2 {
		t.Fatalf("reload invocations = %q, %v, want two", data, err)
	}

	// An empty command runs nothing.
	e.cfg.FTPReloadCmd = ""
	e.rebuild()
	if _, err := e.svc.Create(t.TempDir(), "", "user2", "password-2"); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if data, err := os.ReadFile(marker); err != nil || strings.Count(string(data), "ftp.reload") != 2 {
		t.Fatalf("empty reload command must not run anything: %q, %v", data, err)
	}

	// A broken reload command is logged but never fails the mutation
	// (mirrors the mail package: the on-disk state is already consistent).
	e.cfg.FTPReloadCmd = filepath.Join(t.TempDir(), "missing-reload-command")
	e.rebuild()
	if _, err := e.svc.Create(t.TempDir(), "", "user3", "password-3"); err != nil {
		t.Fatalf("Create with broken reload must succeed: %v", err)
	}
}

func TestDryRunRefusesMutations(t *testing.T) {
	e := newEnv(t)
	e.cfg.DryRun = true
	e.rebuild()
	siteRoot := t.TempDir()

	_, err := e.svc.Create(siteRoot, "files", "deploy", "correct-horse")
	assertAPIErr(t, err, 409, "dry_run")
	// The dry-run refusal wins even over invalid input (mirrors mail).
	_, err = e.svc.Create(siteRoot, "../escape", "bad name", "x")
	assertAPIErr(t, err, 409, "dry_run")
	assertAPIErr(t, e.svc.Delete("deploy"), 409, "dry_run")
	assertAPIErr(t, e.svc.SetPassword("deploy", "correct-horse"), 409, "dry_run")

	if accounts, err := e.svc.List(); err != nil || len(accounts) != 0 {
		t.Fatalf("List = %v, %v", accounts, err)
	}
	if status := e.svc.Status(); status.Accounts != 0 {
		t.Fatalf("Status = %+v", status)
	}
	if _, err := os.Stat(e.cfg.FTPPasswdFile); !os.IsNotExist(err) {
		t.Fatalf("dry-run created FTP state: %v", err)
	}
	if _, err := os.Stat(filepath.Join(siteRoot, "files")); !os.IsNotExist(err) {
		t.Fatalf("dry-run created a home directory: %v", err)
	}
	e.assertAuditLacks(`"action":"ftp.`)
}
