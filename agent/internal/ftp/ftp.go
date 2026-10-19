// Package ftp manages virtual FTP accounts for pure-ftpd: a file-backed
// passwd file (login:crypt:uid:gid:gecos:home:shell) plus an optional reload
// command that regenerates the pure-ftpd PureDB. See docs/api.md section 1.9.
package ftp

import (
	"context"
	"fmt"
	stdlog "log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/runas"
	"clouddeck/agent/internal/safeexec"
)

// Audit actions owned by the FTP endpoints.
const (
	actionCreate   = "ftp.create"
	actionDelete   = "ftp.delete"
	actionPassword = "ftp.password"
)

// Frozen limits from docs/api.md section 1.9.
const (
	// minPasswordLen is the frozen minimum password length.
	minPasswordLen = 8
	// passwdFileMode is the frozen mode of AGENT_FTP_PASSWD_FILE.
	passwdFileMode = 0o644
	// homeDirMode is the mode of every directory the service creates.
	homeDirMode = 0o755
)

// nameRe is the frozen login-name regex.
var nameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._@-]{1,32}$`)

// Account is one virtual FTP login as stored in the passwd file.
type Account struct {
	Name   string `json:"name"`
	Home   string `json:"home"`
	UID    int    `json:"uid"`
	GID    int    `json:"gid"`
	Site   string `json:"site,omitempty"`   // derived by the server layer from Home
	Subdir string `json:"subdir,omitempty"` // derived by the server layer from Home
}

// Status is the /v1/ftp/status body.
type Status struct {
	PasswdFile string `json:"passwdFile"`
	RunAs      string `json:"runAs"`
	Accounts   int    `json:"accounts"`
}

// Service coordinates the FTP passwd file.
type Service struct {
	cfg   config.Config
	audit *audit.Log

	// mu serializes read-modify-write cycles on the passwd file.
	mu sync.Mutex
}

// New creates the FTP service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog}
}

// List returns every account, sorted by login name. A missing passwd file
// reads as an empty list; lines that do not parse are skipped.
func (s *Service) List() ([]Account, error) {
	lines, err := readLines(s.cfg.FTPPasswdFile)
	if err != nil {
		return nil, apierr.Internal(fmt.Sprintf("read passwd file: %v", err))
	}
	accounts := make([]Account, 0, len(lines))
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok {
			accounts = append(accounts, entry.account())
		}
	}
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].Name < accounts[j].Name })
	return accounts, nil
}

// Create adds one account whose home is siteRoot/subdir (created when
// missing). The home must stay inside siteRoot.
func (s *Service) Create(siteRoot, subdir, name, password string) (Account, error) {
	if s.cfg.DryRun {
		return Account{}, dryRunErr()
	}
	if err := validateName(name); err != nil {
		return Account{}, s.reject(actionCreate, map[string]any{"name": name}, err)
	}
	params := map[string]any{"name": name}
	if err := validatePassword(password); err != nil {
		return Account{}, s.reject(actionCreate, params, err)
	}
	home, err := resolveHome(siteRoot, subdir)
	if err != nil {
		return Account{}, s.reject(actionCreate, params, err)
	}
	params["home"] = home
	uid, gid, err := lookupRunAs(s.cfg.FTPRunAs)
	if err != nil {
		return Account{}, s.reject(actionCreate, params, err)
	}
	if err := s.createAccountFiles(name, password, home, uid, gid); err != nil {
		return Account{}, s.reject(actionCreate, params, err)
	}
	if err := s.record(actionCreate, params); err != nil {
		return Account{}, err
	}
	s.reload()
	return Account{Name: name, Home: home, UID: uid, GID: gid}, nil
}

// createAccountFiles creates the home directory and appends the passwd-file
// entry. Errors: 409 ftp_user_exists, 500 internal.
func (s *Service) createAccountFiles(name, password, home string, uid, gid int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.FTPPasswdFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read passwd file: %v", err))
	}
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok && entry.login == name {
			return apierr.Conflict("ftp_user_exists", fmt.Sprintf("FTP account %q already exists", name))
		}
	}
	if err := mkdirHome(home, uid, gid); err != nil {
		return err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("generate password hash: %v", err))
	}
	entry := passwdEntry{login: name, hash: hash, uid: uid, gid: gid, home: home}
	lines = append(lines, entry.String())
	if err := writeFileAtomic(s.cfg.FTPPasswdFile, joinLines(lines), passwdFileMode); err != nil {
		return apierr.Internal(fmt.Sprintf("write passwd file: %v", err))
	}
	return nil
}

// Delete removes one account by login name; its home directory is kept.
func (s *Service) Delete(name string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"name": name}
	if err := s.removeAccount(name); err != nil {
		return s.reject(actionDelete, params, err)
	}
	if err := s.record(actionDelete, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// removeAccount drops the passwd-file line; the home directory is kept on
// disk.
func (s *Service) removeAccount(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.FTPPasswdFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read passwd file: %v", err))
	}
	found := false
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok && entry.login == name {
			found = true
			continue
		}
		kept = append(kept, line)
	}
	if !found {
		return apierr.NotFound("ftp_user_not_found", fmt.Sprintf("FTP account %q does not exist", name))
	}
	if err := writeFileAtomic(s.cfg.FTPPasswdFile, joinLines(kept), passwdFileMode); err != nil {
		return apierr.Internal(fmt.Sprintf("write passwd file: %v", err))
	}
	return nil
}

// SetPassword rotates one account's password.
func (s *Service) SetPassword(name, password string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"name": name}
	if err := validatePassword(password); err != nil {
		return s.reject(actionPassword, params, err)
	}
	if err := s.updatePassword(name, password); err != nil {
		return s.reject(actionPassword, params, err)
	}
	if err := s.record(actionPassword, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// updatePassword rewrites the single passwd-file line matching name. The
// plaintext never leaves this call: only the "$6$" hash is stored.
func (s *Service) updatePassword(name, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.FTPPasswdFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read passwd file: %v", err))
	}
	found := false
	for i, line := range lines {
		entry, ok := parsePasswdLine(line)
		if !ok || entry.login != name {
			continue
		}
		hash, err := hashPassword(password)
		if err != nil {
			return apierr.Internal(fmt.Sprintf("generate password hash: %v", err))
		}
		entry.hash = hash
		lines[i] = entry.String()
		found = true
	}
	if !found {
		return apierr.NotFound("ftp_user_not_found", fmt.Sprintf("FTP account %q does not exist", name))
	}
	if err := writeFileAtomic(s.cfg.FTPPasswdFile, joinLines(lines), passwdFileMode); err != nil {
		return apierr.Internal(fmt.Sprintf("write passwd file: %v", err))
	}
	return nil
}

// Status reports the passwd file location and account count. It never fails:
// an unreadable file counts as zero.
func (s *Service) Status() Status {
	status := Status{PasswdFile: s.cfg.FTPPasswdFile, RunAs: s.cfg.FTPRunAs}
	if lines, err := readLines(s.cfg.FTPPasswdFile); err == nil {
		for _, line := range lines {
			if _, ok := parsePasswdLine(line); ok {
				status.Accounts++
			}
		}
	}
	return status
}

// dryRunErr is the frozen reply of every FTP mutation in dry-run mode.
func dryRunErr() error {
	return apierr.Conflict("dry_run", "ftp operations are disabled in dry-run mode")
}

// record appends the accepted audit entry for a mutation. When the write
// fails the mutation itself is already applied to disk, so that is logged
// loudly and surfaced as a 500.
func (s *Service) record(action string, params map[string]any) error {
	if err := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}); err != nil {
		stdlog.Printf("ftp: WARNING: %s %v already applied on disk but writing the audit log failed: %v", action, params, err)
		return apierr.Internal(fmt.Sprintf("write audit log: %v (the change may already be applied)", err))
	}
	return nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("ftp: write audit log: %v", auditErr)
	}
	return err
}

// reload runs AGENT_FTP_RELOAD_CMD after mutations that change the passwd
// file. The command is split on whitespace and executed without a shell;
// failures are logged, never returned, because the on-disk state is already
// consistent.
func (s *Service) reload() {
	argv := strings.Fields(s.cfg.FTPReloadCmd)
	if len(argv) == 0 {
		return
	}
	if err := safeexec.Run(context.Background(), s.cfg.DryRun, s.logf, argv[0], argv[1:]...); err != nil {
		stdlog.Printf("ftp: reload command failed: %v", err)
	}
}

// logf adapts the agent's log output to safeexec.Logger.
func (s *Service) logf(level, message string) {
	stdlog.Printf("ftp: %s: %s", level, message)
}

// validateName enforces the frozen login-name regex.
func validateName(name string) error {
	if !nameRe.MatchString(name) {
		return apierr.BadRequest("invalid_name", fmt.Sprintf("invalid FTP login %q", name))
	}
	return nil
}

// validatePassword enforces the frozen minimum length. The plaintext is only
// ever held in memory: it is never stored, logged or audited.
func validatePassword(password string) error {
	if utf8.RuneCountInString(password) < minPasswordLen {
		return apierr.BadRequest("invalid_password", fmt.Sprintf("password must be at least %d characters", minPasswordLen))
	}
	return nil
}

// resolveHome joins siteRoot and subdir. The subdir must be empty or a
// relative path that stays inside siteRoot; ".." segments and absolute paths
// are refused with 400 invalid_path.
func resolveHome(siteRoot, subdir string) (string, error) {
	root := filepath.Clean(siteRoot)
	if subdir == "" {
		return root, nil
	}
	sep := string(filepath.Separator)
	if strings.ContainsRune(subdir, 0) || filepath.IsAbs(subdir) {
		return "", invalidPath(subdir)
	}
	cleaned := filepath.Clean(subdir)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+sep) {
		return "", invalidPath(subdir)
	}
	home := filepath.Join(root, cleaned)
	if home != root && !strings.HasPrefix(home, root+sep) {
		return "", invalidPath(subdir)
	}
	return home, nil
}

func invalidPath(subdir string) error {
	return apierr.BadRequest("invalid_path", fmt.Sprintf("invalid subdirectory %q", subdir))
}

// lookupRunAs resolves the numeric uid/gid of the configured run-as user.
// An unknown user is an internal error (500).
func lookupRunAs(username string) (int, int, error) {
	uid, gid, err := runas.Lookup(username)
	if err != nil {
		return 0, 0, apierr.Internal(fmt.Sprintf("resolve run-as user: %v", err))
	}
	return uid, gid, nil
}

// mkdirHome creates every missing directory down to home with mode 0755 and
// chowns exactly the directories it created to uid/gid; pre-existing ones are
// left untouched.
func mkdirHome(home string, uid, gid int) error {
	var missing []string
	dir := filepath.Clean(home)
	for {
		info, err := os.Stat(dir)
		if err == nil {
			if !info.IsDir() {
				return apierr.Internal(fmt.Sprintf("home path %s exists and is not a directory", dir))
			}
			break
		}
		if !os.IsNotExist(err) {
			return apierr.Internal(fmt.Sprintf("stat %s: %v", dir, err))
		}
		missing = append(missing, dir)
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	for i := len(missing) - 1; i >= 0; i-- {
		path := missing[i]
		if err := os.Mkdir(path, homeDirMode); err != nil {
			return apierr.Internal(fmt.Sprintf("create home directory %s: %v", path, err))
		}
		if err := os.Chown(path, uid, gid); err != nil {
			return apierr.Internal(fmt.Sprintf("chown home directory %s: %v", path, err))
		}
		if err := os.Chmod(path, homeDirMode); err != nil {
			return apierr.Internal(fmt.Sprintf("chmod home directory %s: %v", path, err))
		}
	}
	return nil
}

// passwdEntry is one parsed pure-ftpd passwd line:
// login:hash:uid:gid:gecos:home:shell.
type passwdEntry struct {
	login string
	hash  string
	uid   int
	gid   int
	home  string
}

// String renders the frozen layout with empty gecos and shell fields.
func (e passwdEntry) String() string {
	return fmt.Sprintf("%s:%s:%d:%d::%s:", e.login, e.hash, e.uid, e.gid, e.home)
}

func (e passwdEntry) account() Account {
	return Account{Name: e.login, Home: e.home, UID: e.uid, GID: e.gid}
}

// parsePasswdLine decodes one line; false when it is blank, a comment or not
// the frozen 7-field shape. Lines that do not parse are preserved verbatim
// when a file is rewritten.
func parsePasswdLine(line string) (passwdEntry, bool) {
	line = strings.TrimSpace(strings.TrimRight(line, "\r"))
	if line == "" || strings.HasPrefix(line, "#") {
		return passwdEntry{}, false
	}
	parts := strings.Split(line, ":")
	if len(parts) != 7 || parts[0] == "" {
		return passwdEntry{}, false
	}
	uid, err := strconv.Atoi(parts[2])
	if err != nil {
		return passwdEntry{}, false
	}
	gid, err := strconv.Atoi(parts[3])
	if err != nil {
		return passwdEntry{}, false
	}
	return passwdEntry{login: parts[0], hash: parts[1], uid: uid, gid: gid, home: parts[5]}, true
}

// readLines reads path as text lines. A missing file is not an error (it
// reads as empty). Line endings keep their content but lose a trailing \r,
// and trailing empty lines are dropped.
func readLines(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(data), "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], "\r")
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines, nil
}

// joinLines renders lines as file content with a trailing newline. An empty
// slice renders as an empty file.
func joinLines(lines []string) []byte {
	if len(lines) == 0 {
		return nil
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

// writeFileAtomic replaces path with data through a temporary file in the
// same directory followed by a rename, so readers never observe a partial
// file. The parent directory is created when missing and the result gets
// mode.
func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file in %s: %w", dir, err)
	}
	tmpName := tmp.Name()
	cleanup := func() { tmp.Close(); os.Remove(tmpName) }

	if _, err := tmp.Write(data); err != nil {
		cleanup()
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("sync %s: %w", path, err)
	}
	if err := tmp.Chmod(mode); err != nil {
		cleanup()
		return fmt.Errorf("chmod %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("close %s: %w", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}
