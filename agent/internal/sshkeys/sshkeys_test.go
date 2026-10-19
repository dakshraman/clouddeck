package sshkeys

import (
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// testKey* is one fixed ed25519 vector. testKeyFingerprint was produced by
// `ssh-keygen -lf` and is cross-checked against the real tool when present.
const (
	testKeyBlob        = "AAAAC3NzaC1lZDI1NTE5AAAAIK1eupE/Y4eXGmd8fu2j1FFIEET8ArC0j6QuYOfbknk6"
	testKeyLine        = "ssh-ed25519 " + testKeyBlob + " clouddeck-test@example"
	testKeyFingerprint = "SHA256:zv5ZFS9Z4whnpuQqLjRbnJAvE+zhD+iVzVt2ON+zozI"
)

// newTestService wires the service to temp dirs and a real audit log.
func newTestService(t *testing.T, mutate func(*config.Config)) (*Service, config.Config, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("sshkey tests require POSIX file modes")
	}
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		SSHKeysFile:  filepath.Join(dir, "ssh", "authorized_keys"),
		SSHKeyDir:    filepath.Join(dir, "ssh", "keys"),
		SSHConfig:    filepath.Join(dir, "sshd_config"),
		SSHKeygenBin: "ssh-keygen",
	}
	if mutate != nil {
		mutate(&cfg)
	}
	return New(cfg, auditLog), cfg, stateDir
}

func wantAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error %d %s, got nil", status, code)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("error = %d %s (%q), want %d %s", apiErr.Status, apiErr.Code, apiErr.Message, status, code)
	}
}

func readAuditLog(t *testing.T, stateDir string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(stateDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	return string(data)
}

func TestParsePublicKeyAndFingerprint(t *testing.T) {
	parsed, ok := parsePublicKey(testKeyLine)
	if !ok {
		t.Fatalf("parsePublicKey rejected the vector key")
	}
	if parsed.Type != "ssh-ed25519" || parsed.Comment != "clouddeck-test@example" {
		t.Fatalf("parsed = %+v", parsed)
	}
	if got := fingerprintOf(parsed.Data); got != testKeyFingerprint {
		t.Fatalf("fingerprint = %q, want %q", got, testKeyFingerprint)
	}
	key := keyFromParsed(parsed)
	if key.Line != testKeyLine || key.Fingerprint != testKeyFingerprint {
		t.Fatalf("key = %+v", key)
	}

	// Cross-check the hardcoded fingerprint against the real ssh-keygen.
	bin, err := exec.LookPath("ssh-keygen")
	if err != nil {
		t.Log("ssh-keygen not found; skipping fingerprint cross-check")
		return
	}
	pubPath := filepath.Join(t.TempDir(), "vector.pub")
	if err := os.WriteFile(pubPath, []byte(testKeyLine+"\n"), 0o600); err != nil {
		t.Fatalf("write vector.pub: %v", err)
	}
	out, err := exec.Command(bin, "-lf", pubPath).Output()
	if err != nil {
		t.Fatalf("ssh-keygen -lf: %v", err)
	}
	fields := strings.Fields(string(out))
	if len(fields) < 2 || fields[1] != testKeyFingerprint {
		t.Fatalf("ssh-keygen -lf = %q, want fingerprint %q", strings.TrimSpace(string(out)), testKeyFingerprint)
	}
}

func TestParsePublicKeyVariants(t *testing.T) {
	padded, ok := parsePublicKey("ssh-ed25519 aGk= padded@example")
	if !ok {
		t.Fatalf("padded base64 rejected")
	}
	unpadded, ok := parsePublicKey("ssh-ed25519 aGk unpadded@example")
	if !ok {
		t.Fatalf("unpadded base64 rejected")
	}
	if string(padded.Data) != "hi" || string(unpadded.Data) != "hi" {
		t.Fatalf("decoded blobs = %q / %q, want \"hi\"", padded.Data, unpadded.Data)
	}
	if fingerprintOf(padded.Data) != fingerprintOf(unpadded.Data) {
		t.Fatalf("padding changes the fingerprint")
	}

	// Comment fields are joined with single spaces.
	commented, ok := parsePublicKey("ssh-rsa aGk=  first   second ")
	if !ok || commented.Comment != "first second" || commented.canonicalLine() != "ssh-rsa aGk= first second" {
		t.Fatalf("comment handling = %+v, ok=%v", commented, ok)
	}

	for _, line := range []string{
		"",
		"ssh-ed25519",
		"ssh-ed25519 ====",
		"ssh-ed25519 a",
		"ssh-ed25519 *not-base64*",
		"ssh-ed25519 -_urlsafe_AAAA",
		"ssh-dss AAAAB3NzaC1kc3M",
		"ssh-ed25519-sk AAAA",
	} {
		if _, ok := parsePublicKey(line); ok {
			t.Errorf("parsePublicKey(%q) accepted an invalid line", line)
		}
	}
}

func TestAddListDeleteRoundtrip(t *testing.T) {
	svc, cfg, stateDir := newTestService(t, nil)

	keys, err := svc.List()
	if err != nil {
		t.Fatalf("List on missing file: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("List on missing file = %d keys, want 0", len(keys))
	}

	added, err := svc.Add("  " + testKeyLine + "  ")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	want := Key{Type: "ssh-ed25519", Fingerprint: testKeyFingerprint, Comment: "clouddeck-test@example", Line: testKeyLine}
	if added != want {
		t.Fatalf("Add returned %+v, want %+v", added, want)
	}

	// The parent dir and file are created with tight modes.
	if info, err := os.Stat(cfg.SSHKeysFile); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("keys file mode = %v, %v; want 0600", info, err)
	}
	if info, err := os.Stat(filepath.Dir(cfg.SSHKeysFile)); err != nil || info.Mode().Perm() != 0o700 {
		t.Fatalf("keys dir mode = %v, %v; want 0700", info, err)
	}

	// Same blob under a different comment is a duplicate (fingerprint match).
	_, err = svc.Add("ssh-ed25519 " + testKeyBlob + " someone-else@example")
	wantAPIError(t, err, 409, "key_exists")

	second := "ssh-rsa aGk= second@example"
	if _, err := svc.Add(second); err != nil {
		t.Fatalf("Add second: %v", err)
	}

	keys, err = svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(keys) != 2 || keys[0].Line != testKeyLine || keys[1].Line != second {
		t.Fatalf("List = %+v, want the two keys in file order", keys)
	}
	if keys[1].Type != "ssh-rsa" || keys[1].Comment != "second@example" {
		t.Fatalf("second key = %+v", keys[1])
	}
	data, err := os.ReadFile(cfg.SSHKeysFile)
	if err != nil {
		t.Fatalf("read keys file: %v", err)
	}
	if string(data) != testKeyLine+"\n"+second+"\n" {
		t.Fatalf("keys file = %q", data)
	}

	if err := svc.Delete("SHA256:does-not-exist"); err != nil {
		wantAPIError(t, err, 404, "key_not_found")
	}
	if err := svc.Delete(testKeyFingerprint); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	data, err = os.ReadFile(cfg.SSHKeysFile)
	if err != nil {
		t.Fatalf("read keys file: %v", err)
	}
	if string(data) != second+"\n" {
		t.Fatalf("keys file after delete = %q", data)
	}
	keys, err = svc.List()
	if err != nil || len(keys) != 1 || keys[0].Line != second {
		t.Fatalf("List after delete = %+v, %v", keys, err)
	}

	log := readAuditLog(t, stateDir)
	for _, want := range []string{`"action":"ssh.key.add"`, `"action":"ssh.key.delete"`, `"result":"rejected"`} {
		if !strings.Contains(log, want) {
			t.Errorf("audit log misses %s:\n%s", want, log)
		}
	}
}

func TestAddPreservesForeignLinesOnDelete(t *testing.T) {
	svc, cfg, _ := newTestService(t, nil)
	if err := os.MkdirAll(filepath.Dir(cfg.SSHKeysFile), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	foreign := "# managed by hand\n" +
		"command=\"echo hi\",no-pty ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB foreign@host\n" +
		"   \n" +
		"ssh-ed25519 aGk= foreign-ed25519@example\n" +
		"ssh-rsa AAAB foreign-rsa@example\n" +
		"this line is not a key at all\n" +
		"   # indented comment\n" +
		"  ssh-ed25519 aGk= trailing@example\n"
	if err := os.WriteFile(cfg.SSHKeysFile, []byte(foreign), 0o644); err != nil {
		t.Fatalf("write keys file: %v", err)
	}

	if _, err := svc.Add(testKeyLine); err != nil {
		t.Fatalf("Add: %v", err)
	}
	data, err := os.ReadFile(cfg.SSHKeysFile)
	if err != nil {
		t.Fatalf("read keys file: %v", err)
	}
	if string(data) != foreign+testKeyLine+"\n" {
		t.Fatalf("file after Add = %q, want the foreign content plus the new key", data)
	}

	keys, err := svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	// The three plain foreign keys and the added one are listed; option
	// lines, blanks, comments and junk are skipped.
	if len(keys) != 4 {
		t.Fatalf("List = %+v, want 4 parseable keys", keys)
	}
	if keys[3].Fingerprint != testKeyFingerprint {
		t.Fatalf("last listed key = %+v, want the added key", keys[3])
	}

	if err := svc.Delete(testKeyFingerprint); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	data, err = os.ReadFile(cfg.SSHKeysFile)
	if err != nil {
		t.Fatalf("read keys file: %v", err)
	}
	if string(data) != foreign {
		t.Fatalf("foreign content changed:\ngot  %q\nwant %q", data, foreign)
	}
	if info, err := os.Stat(cfg.SSHKeysFile); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("keys file mode after delete = %v, %v; want 0600", info, err)
	}

	// A file whose last line has no terminator: Add inserts the separator and
	// Delete removes only the appended line, leaving the foreign bytes intact.
	unterminated := "# foreign, no final newline\nssh-rsa AAAB tail"
	if err := os.WriteFile(cfg.SSHKeysFile, []byte(unterminated), 0o600); err != nil {
		t.Fatalf("write keys file: %v", err)
	}
	if _, err := svc.Add(testKeyLine); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if data, err := os.ReadFile(cfg.SSHKeysFile); err != nil || string(data) != unterminated+"\n"+testKeyLine+"\n" {
		t.Fatalf("file after Add = %q, %v; want a separator before the new key", data, err)
	}
	if err := svc.Delete(testKeyFingerprint); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if data, err := os.ReadFile(cfg.SSHKeysFile); err != nil || string(data) != unterminated+"\n" {
		t.Fatalf("file after Delete = %q, %v; want every foreign line unchanged", data, err)
	}
}

func TestAddRejectsInvalidKeys(t *testing.T) {
	svc, cfg, stateDir := newTestService(t, nil)
	for _, line := range []string{
		"",
		"ssh-ed25519",
		"ssh-ed25519 not-base64!!",
		"ssh-dss AAAAB3NzaC1kc3M",
		"ecdsa-sha2-nistp256 ====",
		"ssh-ed25519   ",
	} {
		_, err := svc.Add(line)
		wantAPIError(t, err, 400, "invalid_key")
	}
	if _, err := os.Stat(cfg.SSHKeysFile); !os.IsNotExist(err) {
		t.Fatalf("invalid keys must not create the keys file: %v", err)
	}
	if log := readAuditLog(t, stateDir); !strings.Contains(log, `"action":"ssh.key.add"`) || !strings.Contains(log, `"result":"rejected"`) {
		t.Errorf("missing rejected ssh.key.add audit record:\n%s", log)
	}
}

func TestGenerateRejectsInvalidNamesAndTypes(t *testing.T) {
	svc, _, _ := newTestService(t, nil)
	for _, name := range []string{"", "Bad", "a_b", "-abc", "a.b", "a b", strings.Repeat("a", 33), "../escape"} {
		_, err := svc.Generate(name, "ed25519", "")
		wantAPIError(t, err, 400, "invalid_name")
	}
	for _, keyType := range []string{"", "dsa", "RSA", "ssh-ed25519", "ssh-rsa", "ecdsa"} {
		_, err := svc.Generate("valid-name", keyType, "")
		wantAPIError(t, err, 400, "invalid_key_type")
	}
	_, err := svc.ReadGenerated("../escape")
	wantAPIError(t, err, 400, "invalid_name")
	err = svc.DeleteGenerated("NOPE")
	wantAPIError(t, err, 400, "invalid_name")
}

func TestGeneratedMissing(t *testing.T) {
	svc, _, _ := newTestService(t, nil)
	if list, err := svc.ListGenerated(); err != nil || len(list) != 0 {
		t.Fatalf("ListGenerated on missing dir = %+v, %v", list, err)
	}
	_, err := svc.ReadGenerated("nosuchkey")
	wantAPIError(t, err, 404, "key_not_found")
	err = svc.DeleteGenerated("nosuchkey")
	wantAPIError(t, err, 404, "key_not_found")
}

func TestGenerateWithSSHKeygen(t *testing.T) {
	bin, err := exec.LookPath("ssh-keygen")
	if err != nil {
		t.Skip("ssh-keygen not found")
	}
	svc, cfg, stateDir := newTestService(t, func(cfg *config.Config) { cfg.SSHKeygenBin = bin })

	key, err := svc.Generate("server-key", "ed25519", "unit test")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if key.Name != "server-key" || key.Type != "ssh-ed25519" || key.Comment != "unit test" {
		t.Fatalf("Generate = %+v", key)
	}
	if key.PrivateKey == "" || !strings.Contains(key.PublicKey, "ssh-ed25519 ") || !strings.HasPrefix(key.Fingerprint, "SHA256:") {
		t.Fatalf("Generate material = %+v", key)
	}
	keyPath := filepath.Join(cfg.SSHKeyDir, "server-key")
	pubPath := keyPath + ".pub"
	for _, path := range []string{keyPath, pubPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("generated file %s: %v", path, err)
		}
	}
	if info, err := os.Stat(keyPath); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("private key mode = %v, %v; want 0600", info, err)
	}
	pubData, err := os.ReadFile(pubPath)
	if err != nil {
		t.Fatalf("read pub: %v", err)
	}
	if strings.TrimSpace(string(pubData)) != key.PublicKey {
		t.Fatalf("PublicKey = %q, file = %q", key.PublicKey, pubData)
	}

	// The returned fingerprint matches ssh-keygen's own output.
	out, err := exec.Command(bin, "-lf", pubPath, "-E", "sha256").Output()
	if err != nil {
		t.Fatalf("ssh-keygen -lf: %v", err)
	}
	if fields := strings.Fields(string(out)); len(fields) < 2 || fields[1] != key.Fingerprint {
		t.Fatalf("ssh-keygen -lf = %q, want %q", strings.TrimSpace(string(out)), key.Fingerprint)
	}

	// Existing files are never overwritten.
	_, err = svc.Generate("server-key", "ed25519", "")
	wantAPIError(t, err, 409, "key_exists")

	// RSA gets -b 4096; an empty comment defaults to "clouddeck".
	rsaKey, err := svc.Generate("rsa-key", "rsa", "")
	if err != nil {
		t.Fatalf("Generate rsa: %v", err)
	}
	if rsaKey.Type != "ssh-rsa" || rsaKey.Comment != "clouddeck" || rsaKey.PrivateKey == "" {
		t.Fatalf("rsa key = %+v", rsaKey)
	}
	out, err = exec.Command(bin, "-lf", filepath.Join(cfg.SSHKeyDir, "rsa-key.pub"), "-E", "sha256").Output()
	if err != nil {
		t.Fatalf("ssh-keygen -lf rsa: %v", err)
	}
	fields := strings.Fields(string(out))
	if len(fields) < 2 || fields[0] != "4096" || fields[1] != rsaKey.Fingerprint {
		t.Fatalf("rsa ssh-keygen -lf = %q, want 4096 bits and %q", strings.TrimSpace(string(out)), rsaKey.Fingerprint)
	}

	// Strays in the key dir are not listed: only name + name.pub pairs.
	for name, content := range map[string]string{
		"stray.pub": testKeyLine + "\n",
		"solo":      "x\n",
	} {
		if err := os.WriteFile(filepath.Join(cfg.SSHKeyDir, name), []byte(content), 0o600); err != nil {
			t.Fatalf("write stray %s: %v", name, err)
		}
	}
	list, err := svc.ListGenerated()
	if err != nil {
		t.Fatalf("ListGenerated: %v", err)
	}
	if len(list) != 2 || list[0].Name != "rsa-key" || list[1].Name != "server-key" {
		t.Fatalf("ListGenerated = %+v, want [rsa-key server-key]", list)
	}
	for _, item := range list {
		if item.PrivateKey != "" {
			t.Fatalf("ListGenerated leaked private material for %s", item.Name)
		}
	}
	if list[1].Fingerprint != key.Fingerprint || list[1].PublicKey != key.PublicKey {
		t.Fatalf("ListGenerated server-key = %+v, want %+v", list[1], key)
	}

	read, err := svc.ReadGenerated("server-key")
	if err != nil {
		t.Fatalf("ReadGenerated: %v", err)
	}
	if read.PrivateKey == "" || read.PrivateKey != key.PrivateKey || read.Fingerprint != key.Fingerprint {
		t.Fatalf("ReadGenerated = %+v", read)
	}

	if err := svc.DeleteGenerated("server-key"); err != nil {
		t.Fatalf("DeleteGenerated: %v", err)
	}
	for _, path := range []string{keyPath, pubPath} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s still exists after DeleteGenerated: %v", path, err)
		}
	}
	err = svc.DeleteGenerated("server-key")
	wantAPIError(t, err, 404, "key_not_found")
	log := readAuditLog(t, stateDir)
	for _, want := range []string{`"action":"ssh.keygen.create"`, `"action":"ssh.keygen.delete"`} {
		if !strings.Contains(log, want) {
			t.Errorf("audit log misses %s:\n%s", want, log)
		}
	}
}

func TestMutationsDryRun(t *testing.T) {
	svc, cfg, _ := newTestService(t, func(cfg *config.Config) { cfg.DryRun = true })

	_, err := svc.Add(testKeyLine)
	wantAPIError(t, err, 409, "dry_run")
	err = svc.Delete(testKeyFingerprint)
	wantAPIError(t, err, 409, "dry_run")
	_, err = svc.Generate("some-key", "ed25519", "")
	wantAPIError(t, err, 409, "dry_run")
	err = svc.DeleteGenerated("some-key")
	wantAPIError(t, err, 409, "dry_run")

	// Reads keep working and nothing was created.
	if keys, err := svc.List(); err != nil || len(keys) != 0 {
		t.Errorf("List in dry-run = %+v, %v", keys, err)
	}
	if keys, err := svc.ListGenerated(); err != nil || len(keys) != 0 {
		t.Errorf("ListGenerated in dry-run = %+v, %v", keys, err)
	}
	if _, err := os.Stat(cfg.SSHKeysFile); !os.IsNotExist(err) {
		t.Errorf("dry-run created the keys file: %v", err)
	}
	if _, err := os.Stat(cfg.SSHKeyDir); !os.IsNotExist(err) {
		t.Errorf("dry-run created the key dir: %v", err)
	}
}

func TestStatus(t *testing.T) {
	svc, cfg, _ := newTestService(t, nil)

	st := svc.Status()
	if st.KeysFile != cfg.SSHKeysFile || st.KeyDir != cfg.SSHKeyDir {
		t.Fatalf("Status paths = %+v", st)
	}
	if st.Port != 22 {
		t.Fatalf("port with missing sshd_config = %d, want 22", st.Port)
	}
	if st.User == "" {
		t.Fatalf("user is empty")
	}
	if host, err := os.Hostname(); err == nil && st.Hostname != host {
		t.Fatalf("hostname = %q, want %q", st.Hostname, host)
	}

	// The last uncommented Port wins; missing files fall back to 22.
	if err := os.WriteFile(cfg.SSHConfig, []byte("#Port 2022\nPort 2222\n# Port 9999\nPort 23\nPort bogus\n"), 0o600); err != nil {
		t.Fatalf("write sshd_config: %v", err)
	}
	if got := svc.Status().Port; got != 23 {
		t.Fatalf("parsed port = %d, want 23", got)
	}

	// The user falls back to the owner of the keys file's parent dir.
	if err := os.MkdirAll(filepath.Dir(cfg.SSHKeysFile), 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	current, err := user.LookupId(strconv.Itoa(os.Getuid()))
	if err == nil && current.Username != "" {
		if got := svc.Status().User; got != current.Username {
			t.Fatalf("fallback user = %q, want %q", got, current.Username)
		}
	}
}
