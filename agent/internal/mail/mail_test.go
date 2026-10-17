package mail

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/dns"
)

// env is one mail service whose every path lives under a temp dir.
type env struct {
	t        *testing.T
	cfg      config.Config
	svc      *Service
	auditLog *audit.Log
	auditDir string
}

// newEnv builds an isolated environment with no DNS manager and no reload
// command. Every path derives from one t.TempDir(), so tests never touch the
// real system.
func newEnv(t *testing.T) *env {
	t.Helper()
	root := t.TempDir()
	cfg := config.Config{
		StateDir:         filepath.Join(root, "state"),
		MailRoot:         filepath.Join(root, "mail"),
		MailDomainsFile:  filepath.Join(root, "mail", "domains"),
		MailUsersFile:    filepath.Join(root, "mail", "users"),
		MailAliasesFile:  filepath.Join(root, "mail", "aliases"),
		MailAutoreplyDir: filepath.Join(root, "mail", "autoreply"),
		MailDkimDir:      filepath.Join(root, "mail", "dkim"),
		MailVhostsDir:    filepath.Join(root, "mail", "vhosts"),
		MailHostname:     "mx.test.example",
	}
	auditDir := cfg.StateDir
	auditLog, err := audit.Open(auditDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return &env{t: t, cfg: cfg, svc: New(cfg, auditLog, nil), auditLog: auditLog, auditDir: auditDir}
}

// withPdns points the environment at a fake pdnsutil and wires a real DNS
// manager against it.
func (e *env) withPdns(replies map[string]fakeReply) (bin, argvFile string) {
	e.t.Helper()
	bin, argvFile = writeFakePdnsutil(e.t, replies)
	e.cfg.PdnsUtilBin = bin
	e.svc = New(e.cfg, e.auditLog, dns.New(e.cfg, e.auditLog))
	return bin, argvFile
}

// seedDomain adds a domain through the API, failing the test on error.
func (e *env) seedDomain(domain string) {
	e.t.Helper()
	if err := e.svc.AddDomain(domain); err != nil {
		e.t.Fatalf("AddDomain(%s): %v", domain, err)
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

// assertAuditContains fails when the audit log lacks any of wants.
func (e *env) assertAuditContains(wants ...string) {
	e.t.Helper()
	data, err := os.ReadFile(filepath.Join(e.auditDir, "audit.log"))
	if err != nil {
		e.t.Fatalf("read audit log: %v", err)
	}
	for _, want := range wants {
		if !strings.Contains(string(data), want) {
			e.t.Errorf("audit log missing %s: %s", want, data)
		}
	}
}

// assertAuditLacks fails when the audit log contains any of unwanted. A
// missing log means nothing was ever audited.
func (e *env) assertAuditLacks(unwanted ...string) {
	e.t.Helper()
	data, err := os.ReadFile(filepath.Join(e.auditDir, "audit.log"))
	if os.IsNotExist(err) {
		return
	}
	if err != nil {
		e.t.Fatalf("read audit log: %v", err)
	}
	for _, value := range unwanted {
		if strings.Contains(string(data), value) {
			e.t.Errorf("audit log must not contain %s: %s", value, data)
		}
	}
}

// ---- fake pdnsutil harness (mirrors agent/internal/dns tests) ----

// fakeReply is one canned pdnsutil response: stdout, stderr and exit code.
type fakeReply struct {
	out  string
	err  string
	code int
}

// writeFakePdnsutil writes an executable stub that records its argv and
// answers the configured subcommands with canned output. A leading
// "--config-dir <dir>" pair is ignored. An unconfigured subcommand exits 9
// with a diagnostic so tests fail loudly.
func writeFakePdnsutil(t *testing.T, replies map[string]fakeReply) (bin, argvFile string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake pdnsutil script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	argvFile = filepath.Join(dir, "argv.txt")

	commands := make([]string, 0, len(replies))
	for cmd := range replies {
		commands = append(commands, cmd)
	}
	sort.Strings(commands)

	var cases strings.Builder
	for i, cmd := range commands {
		reply := replies[cmd]
		outFile := filepath.Join(dir, fmt.Sprintf("out-%d.txt", i))
		errFile := filepath.Join(dir, fmt.Sprintf("err-%d.txt", i))
		if err := os.WriteFile(outFile, []byte(reply.out), 0o644); err != nil {
			t.Fatalf("write fake stdout: %v", err)
		}
		if err := os.WriteFile(errFile, []byte(reply.err), 0o644); err != nil {
			t.Fatalf("write fake stderr: %v", err)
		}
		fmt.Fprintf(&cases, "  %s)\n    cat %s\n    cat %s >&2\n    exit %d\n    ;;\n",
			shQuote(cmd), shQuote(outFile), shQuote(errFile), reply.code)
	}

	script := "#!/bin/sh\n" +
		"printf '%s\\n' '---' \"$@\" >> " + shQuote(argvFile) + "\n" +
		"if [ \"$1\" = \"--config-dir\" ]; then shift 2; fi\n" +
		"cmd=$1\n" +
		"case \"$cmd\" in\n" + cases.String() + "esac\n" +
		"echo \"fake pdnsutil: unexpected command: $*\" >&2\n" +
		"exit 9\n"

	bin = filepath.Join(dir, "fake-pdnsutil")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pdnsutil: %v", err)
	}
	return bin, argvFile
}

// shQuote wraps s in single quotes for POSIX sh.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// readArgvs returns the argv of every invocation the fake recorded.
func readArgvs(t *testing.T, argvFile string) [][]string {
	t.Helper()
	data, err := os.ReadFile(argvFile)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatalf("read fake argv: %v", err)
	}
	var calls [][]string
	for _, block := range strings.Split(string(data), "---\n") {
		block = strings.TrimRight(block, "\n")
		if block == "" {
			continue
		}
		calls = append(calls, strings.Split(block, "\n"))
	}
	return calls
}

// writeStub writes a small POSIX shell script and returns its path.
func writeStub(t *testing.T, body string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("stub script requires a POSIX shell")
	}
	path := filepath.Join(t.TempDir(), "stub.sh")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatalf("write stub: %v", err)
	}
	return path
}

// ---- validation matrix ----

func TestValidateEmailMatrix(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantCode string
	}{
		{name: "simple", input: "user@example.com", want: "user@example.com"},
		{name: "uppercase normalized", input: "User.Name@Example.COM", want: "user.name@example.com"},
		{name: "trims whitespace", input: "  user@example.com  ", want: "user@example.com"},
		{name: "dots dashes underscores", input: "a.b_c-d@example.com", want: "a.b_c-d@example.com"},
		{name: "single char local", input: "a@example.com", want: "a@example.com"},
		{name: "long local", input: strings.Repeat("a", 63) + "@example.com", want: strings.Repeat("a", 63) + "@example.com"},
		{name: "empty", input: "", wantCode: "invalid_email"},
		{name: "no at", input: "userexample.com", wantCode: "invalid_email"},
		{name: "no local", input: "@example.com", wantCode: "invalid_email"},
		{name: "no domain", input: "user@", wantCode: "invalid_email"},
		{name: "two at", input: "a@b@example.com", wantCode: "invalid_email"},
		{name: "plus tag", input: "user+tag@example.com", wantCode: "invalid_email"},
		{name: "leading dot local", input: ".user@example.com", wantCode: "invalid_email"},
		{name: "local too long", input: strings.Repeat("a", 64) + "@example.com", wantCode: "invalid_email"},
		{name: "invalid domain", input: "user@not a domain", wantCode: "invalid_email"},
		{name: "single label domain", input: "user@example", wantCode: "invalid_email"},
		{name: "shell metacharacters", input: "user@example.com; rm -rf /", wantCode: "invalid_email"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateEmail(tt.input)
			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got != tt.want {
					t.Fatalf("got %q, want %q", got, tt.want)
				}
				return
			}
			assertAPIErr(t, err, 400, tt.wantCode)
		})
	}
}

func TestValidatePasswordAndQuota(t *testing.T) {
	if err := validatePassword("12345678"); err != nil {
		t.Fatalf("8 chars rejected: %v", err)
	}
	if err := validatePassword("1234567"); err == nil {
		t.Fatal("7 chars accepted")
	} else {
		assertAPIErr(t, err, 400, "invalid_password")
	}
	if err := validatePassword("pässwörd"); err != nil {
		t.Fatalf("8 unicode chars rejected: %v", err)
	}

	if err := validateQuota(0); err != nil {
		t.Fatalf("quota 0 rejected: %v", err)
	}
	if err := validateQuota(1048576); err != nil {
		t.Fatalf("max quota rejected: %v", err)
	}
	for _, bad := range []int64{-1, 1048577} {
		err := validateQuota(bad)
		assertAPIErr(t, err, 400, "invalid_quota")
	}
}

func TestValidateAutoresponder(t *testing.T) {
	if err := validateAutoresponder("Away", "I am away"); err != nil {
		t.Fatalf("valid autoresponder rejected: %v", err)
	}
	cases := []struct{ subject, body string }{
		{"", "body"},
		{strings.Repeat("s", 201), "body"},
		{"line\nbreak", "body"},
		{"subject", ""},
		{"subject", strings.Repeat("b", 10001)},
	}
	for _, tc := range cases {
		err := validateAutoresponder(tc.subject, tc.body)
		assertAPIErr(t, err, 400, "invalid_autoresponder")
	}
}

// ---- domains ----

func TestEmptyState(t *testing.T) {
	e := newEnv(t)
	domains, err := e.svc.ListDomains()
	if err != nil || len(domains) != 0 {
		t.Fatalf("ListDomains = %v, %v; want empty", domains, err)
	}
	accounts, err := e.svc.ListAccounts("")
	if err != nil || len(accounts) != 0 {
		t.Fatalf("ListAccounts = %v, %v; want empty", accounts, err)
	}
	forwarders, err := e.svc.ListForwarders("")
	if err != nil || len(forwarders) != 0 {
		t.Fatalf("ListForwarders = %v, %v; want empty", forwarders, err)
	}
	status := e.svc.Status()
	if status.BaseDir != e.cfg.MailRoot || status.Hostname != "mx.test.example" {
		t.Fatalf("Status = %+v, want baseDir %q hostname mx.test.example", status, e.cfg.MailRoot)
	}
	if status.Domains != 0 || status.Accounts != 0 || status.DKIMEnabled != 0 {
		t.Fatalf("Status counts = %+v, want zeros", status)
	}
}

func TestDomainsCRUD(t *testing.T) {
	e := newEnv(t)

	if err := e.svc.AddDomain("Example.COM"); err != nil {
		t.Fatalf("AddDomain: %v", err)
	}
	if got := e.readFile(e.cfg.MailDomainsFile); got != "example.com\n" {
		t.Fatalf("domains file = %q, want %q", got, "example.com\n")
	}

	err := e.svc.AddDomain("example.com")
	assertAPIErr(t, err, 409, "mail_domain_exists")

	err = e.svc.AddDomain("not a domain")
	assertAPIErr(t, err, 400, "invalid_domain")

	if err := e.svc.AddDomain("b.example.org"); err != nil {
		t.Fatalf("AddDomain second: %v", err)
	}
	domains, err := e.svc.ListDomains()
	if err != nil {
		t.Fatalf("ListDomains: %v", err)
	}
	if want := []string{"b.example.org", "example.com"}; !reflect.DeepEqual(domains, want) {
		t.Fatalf("ListDomains = %v, want %v", domains, want)
	}

	err = e.svc.DeleteDomain("gone.example")
	assertAPIErr(t, err, 404, "mail_domain_not_found")

	if err := e.svc.DeleteDomain("EXAMPLE.com"); err != nil {
		t.Fatalf("DeleteDomain: %v", err)
	}
	domains, _ = e.svc.ListDomains()
	if want := []string{"b.example.org"}; !reflect.DeepEqual(domains, want) {
		t.Fatalf("after delete ListDomains = %v, want %v", domains, want)
	}
	err = e.svc.DeleteDomain("example.com")
	assertAPIErr(t, err, 404, "mail_domain_not_found")

	e.assertAuditContains(
		`"action":"mail.domain.create"`, `"action":"mail.domain.delete"`,
		`"result":"accepted"`, `"result":"rejected"`,
		`"domain":"example.com"`,
	)
}

func TestDomainReadNormalizesHandEdits(t *testing.T) {
	e := newEnv(t)
	if err := os.MkdirAll(filepath.Dir(e.cfg.MailDomainsFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(e.cfg.MailDomainsFile, []byte("# comment\nb.example.org\nA.example.com\n\nb.example.org\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	domains, err := e.svc.ListDomains()
	if err != nil {
		t.Fatalf("ListDomains: %v", err)
	}
	if want := []string{"a.example.com", "b.example.org"}; !reflect.DeepEqual(domains, want) {
		t.Fatalf("ListDomains = %v, want %v", domains, want)
	}
}

// ---- accounts ----

func TestCreateAccountPasswdRoundTrip(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")

	account, err := e.svc.CreateAccount("User@Example.COM", "s3cret-pass", 512)
	if err != nil {
		t.Fatalf("CreateAccount: %v", err)
	}
	if account.Email != "user@example.com" || account.Domain != "example.com" {
		t.Fatalf("account = %+v, want normalized email/domain", account)
	}
	if account.QuotaMB != 512 || account.Bytes != 0 {
		t.Fatalf("account = %+v, want quota 512 and 0 bytes", account)
	}

	// The maildir exists with the three Maildir folders.
	for _, sub := range []string{"cur", "new", "tmp"} {
		info, err := os.Stat(filepath.Join(e.cfg.MailVhostsDir, "user@example.com", sub))
		if err != nil || !info.IsDir() {
			t.Fatalf("maildir %s missing: %v", sub, err)
		}
	}

	// Passwd-file layout: 8 colon fields + the quota rule, SHA256 hash, no
	// plaintext password anywhere.
	raw := e.readFile(e.cfg.MailUsersFile)
	want := "user@example.com:" + hashPassword("s3cret-pass") + ":5000:5000::" +
		filepath.Join(e.cfg.MailVhostsDir, "user@example.com") + ":: userdb_quota_rule=*:bytes=536870912\n"
	if raw != want {
		t.Fatalf("users file = %q, want %q", raw, want)
	}
	if strings.Contains(raw, "s3cret-pass") {
		t.Fatalf("users file leaks the plaintext password: %q", raw)
	}
	sum := hashPassword("s3cret-pass")
	if !strings.HasPrefix(sum, "{SHA256}") {
		t.Fatalf("hash %q does not use the {SHA256} scheme", sum)
	}
	info, err := os.Stat(e.cfg.MailUsersFile)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("users file mode = %o, want 600", info.Mode().Perm())
	}

	// Round-trip through the parser: every frozen field must survive.
	lines, err := os.ReadFile(e.cfg.MailUsersFile)
	if err != nil {
		t.Fatal(err)
	}
	entry, ok := parsePasswdLine(strings.TrimSuffix(string(lines), "\n"))
	if !ok {
		t.Fatalf("cannot parse written line %q", lines)
	}
	if entry.email() != "user@example.com" || entry.fields[1] != sum {
		t.Fatalf("parsed entry = %+v, want email + hash", entry)
	}
	if entry.fields[2] != "5000" || entry.fields[3] != "5000" {
		t.Fatalf("uid/gid = %s/%s, want 5000/5000", entry.fields[2], entry.fields[3])
	}
	if entry.home() != filepath.Join(e.cfg.MailVhostsDir, "user@example.com") {
		t.Fatalf("home = %q", entry.home())
	}
	if !entry.hasQuota || entry.quotaBytes != 512*bytesPerMB {
		t.Fatalf("quota = %d/%v, want 536870912", entry.quotaBytes, entry.hasQuota)
	}

	// List returns the same normalized account.
	accounts, err := e.svc.ListAccounts("example.com")
	if err != nil {
		t.Fatalf("ListAccounts: %v", err)
	}
	if len(accounts) != 1 || accounts[0].Email != "user@example.com" || accounts[0].QuotaMB != 512 {
		t.Fatalf("ListAccounts = %+v, want the created account", accounts)
	}
	if accounts[0].CreatedAt.IsZero() {
		t.Fatalf("CreatedAt is zero")
	}
	if got := accounts[0].Bytes; got != 0 {
		t.Fatalf("bytes = %d, want 0", got)
	}

	// A file inside the maildir shows up in bytes.
	mailFile := filepath.Join(e.cfg.MailVhostsDir, "user@example.com", "cur", "msg1")
	if err := os.WriteFile(mailFile, []byte("hello mail"), 0o600); err != nil {
		t.Fatal(err)
	}
	accounts, _ = e.svc.ListAccounts("")
	if want := int64(len("hello mail")); accounts[0].Bytes != want {
		t.Fatalf("bytes = %d, want %d", accounts[0].Bytes, want)
	}

	e.assertAuditContains(`"action":"mail.account.create"`, `"result":"accepted"`, `"quotaMb":512`)
	e.assertAuditLacks("s3cret-pass")
}

func TestCreateAccountErrors(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")

	_, err := e.svc.CreateAccount("user@other.example", "s3cret-pass", 0)
	assertAPIErr(t, err, 404, "mail_domain_not_found")

	_, err = e.svc.CreateAccount("bad email", "s3cret-pass", 0)
	assertAPIErr(t, err, 400, "invalid_email")

	_, err = e.svc.CreateAccount("user@example.com", "short", 0)
	assertAPIErr(t, err, 400, "invalid_password")

	_, err = e.svc.CreateAccount("user@example.com", "s3cret-pass", -1)
	assertAPIErr(t, err, 400, "invalid_quota")

	_, err = e.svc.CreateAccount("user@example.com", "s3cret-pass", 1048577)
	assertAPIErr(t, err, 400, "invalid_quota")

	// An account without quota has no quota field at all.
	if _, err := e.svc.CreateAccount("free@example.com", "s3cret-pass", 0); err != nil {
		t.Fatalf("CreateAccount: %v", err)
	}
	if raw := e.readFile(e.cfg.MailUsersFile); strings.Contains(raw, "userdb_quota_rule") {
		t.Fatalf("zero-quota account must not carry a quota rule: %q", raw)
	}

	_, err = e.svc.CreateAccount("free@example.com", "s3cret-pass", 0)
	assertAPIErr(t, err, 409, "mail_account_exists")
}

func TestAccountMutations(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	if _, err := e.svc.CreateAccount("user@example.com", "old-password", 128); err != nil {
		t.Fatalf("CreateAccount: %v", err)
	}
	home := filepath.Join(e.cfg.MailVhostsDir, "user@example.com")

	if err := e.svc.SetPassword("user@example.com", "new-password"); err != nil {
		t.Fatalf("SetPassword: %v", err)
	}
	raw := e.readFile(e.cfg.MailUsersFile)
	if strings.Contains(raw, hashPassword("old-password")) || !strings.Contains(raw, hashPassword("new-password")) {
		t.Fatalf("SetPassword did not rewrite the hash: %q", raw)
	}
	if !strings.Contains(raw, "userdb_quota_rule=*:bytes="+fmt.Sprint(128*bytesPerMB)) {
		t.Fatalf("SetPassword dropped the quota field: %q", raw)
	}
	e.assertAuditContains(`"action":"mail.account.password"`, `"result":"accepted"`)
	e.assertAuditLacks("new-password", "old-password")

	if err := e.svc.SetQuota("user@example.com", 0); err != nil {
		t.Fatalf("SetQuota zero: %v", err)
	}
	if raw := e.readFile(e.cfg.MailUsersFile); strings.Contains(raw, "userdb_quota_rule") {
		t.Fatalf("quota 0 must remove the field: %q", raw)
	}
	if err := e.svc.SetQuota("user@example.com", 1048576); err != nil {
		t.Fatalf("SetQuota max: %v", err)
	}
	if raw := e.readFile(e.cfg.MailUsersFile); !strings.Contains(raw, "userdb_quota_rule=*:bytes=1099511627776") {
		t.Fatalf("quota max not written: %q", raw)
	}
	e.assertAuditContains(`"action":"mail.account.quota"`, `"quotaMb":1048576`)

	err := e.svc.SetPassword("user@example.com", "short")
	assertAPIErr(t, err, 400, "invalid_password")
	err = e.svc.SetQuota("user@example.com", -5)
	assertAPIErr(t, err, 400, "invalid_quota")
	err = e.svc.SetPassword("gone@example.com", "longenough")
	assertAPIErr(t, err, 404, "mail_account_not_found")
	err = e.svc.SetQuota("gone@example.com", 10)
	assertAPIErr(t, err, 404, "mail_account_not_found")
	err = e.svc.SetPassword("bad email", "longenough")
	assertAPIErr(t, err, 400, "invalid_email")
	err = e.svc.SetQuota("bad email", 10)
	assertAPIErr(t, err, 400, "invalid_email")

	if err := e.svc.DeleteAccount("USER@example.com"); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}
	if raw := e.readFileOrEmpty(e.cfg.MailUsersFile); strings.Contains(raw, "user@example.com") {
		t.Fatalf("entry still present after delete: %q", raw)
	}
	if _, err := os.Stat(home); err != nil {
		t.Fatalf("maildir must be kept after delete: %v", err)
	}
	err = e.svc.DeleteAccount("user@example.com")
	assertAPIErr(t, err, 404, "mail_account_not_found")
	err = e.svc.DeleteAccount("bad email")
	assertAPIErr(t, err, 400, "invalid_email")
	e.assertAuditContains(`"action":"mail.account.delete"`, `"result":"accepted"`)
}

func TestListAccountsFilterAndValidation(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	e.seedDomain("other.example")
	for _, address := range []string{"b@example.com", "a@example.com", "c@other.example"} {
		if _, err := e.svc.CreateAccount(address, "s3cret-pass", 0); err != nil {
			t.Fatalf("CreateAccount(%s): %v", address, err)
		}
	}
	accounts, err := e.svc.ListAccounts("example.com")
	if err != nil {
		t.Fatalf("ListAccounts: %v", err)
	}
	if len(accounts) != 2 || accounts[0].Email != "a@example.com" || accounts[1].Email != "b@example.com" {
		t.Fatalf("ListAccounts = %+v, want sorted example.com accounts", accounts)
	}
	_, err = e.svc.ListAccounts("not a domain")
	assertAPIErr(t, err, 400, "invalid_domain")
	// A syntactically valid but unlisted domain is an empty filter match.
	accounts, err = e.svc.ListAccounts("nolist.example")
	if err != nil || len(accounts) != 0 {
		t.Fatalf("ListAccounts(unlisted) = %v, %v; want empty", accounts, err)
	}
}

// ---- forwarders ----

func TestForwardersCRUD(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")

	if err := e.svc.CreateForwarder("Sales@Example.COM", "One@Elsewhere.COM, two@Elsewhere.com"); err != nil {
		t.Fatalf("CreateForwarder: %v", err)
	}
	if got, want := e.readFile(e.cfg.MailAliasesFile), "sales@example.com one@elsewhere.com, two@elsewhere.com\n"; got != want {
		t.Fatalf("aliases file = %q, want %q", got, want)
	}

	err := e.svc.CreateForwarder("sales@example.com", "x@elsewhere.com")
	assertAPIErr(t, err, 409, "forwarder_exists")

	err = e.svc.CreateForwarder("who@nolist.example", "x@elsewhere.com")
	assertAPIErr(t, err, 404, "mail_domain_not_found")

	err = e.svc.CreateForwarder("bad source", "x@elsewhere.com")
	assertAPIErr(t, err, 400, "invalid_email")

	err = e.svc.CreateForwarder("info@example.com", "not-an-address")
	assertAPIErr(t, err, 400, "invalid_email")

	err = e.svc.CreateForwarder("info@example.com", "  ,  ")
	assertAPIErr(t, err, 400, "invalid_email")

	if err := e.svc.CreateForwarder("info@example.com", "keep@example.com"); err != nil {
		t.Fatalf("CreateForwarder second: %v", err)
	}

	forwarders, err := e.svc.ListForwarders("example.com")
	if err != nil {
		t.Fatalf("ListForwarders: %v", err)
	}
	if len(forwarders) != 2 {
		t.Fatalf("ListForwarders = %+v, want 2 entries", forwarders)
	}
	if forwarders[0].Source != "info@example.com" || forwarders[0].Target != "keep@example.com" {
		t.Fatalf("forwarders[0] = %+v", forwarders[0])
	}
	if forwarders[0].CreatedAt.IsZero() {
		t.Fatalf("createdAt is zero")
	}
	forwarders, err = e.svc.ListForwarders("nolist.example")
	if err != nil || len(forwarders) != 0 {
		t.Fatalf("ListForwarders(unlisted) = %v, %v; want empty", forwarders, err)
	}
	_, err = e.svc.ListForwarders("not a domain")
	assertAPIErr(t, err, 400, "invalid_domain")

	err = e.svc.DeleteForwarder("missing@example.com")
	assertAPIErr(t, err, 404, "forwarder_not_found")
	err = e.svc.DeleteForwarder("bad source")
	assertAPIErr(t, err, 400, "invalid_email")

	if err := e.svc.DeleteForwarder("SALES@example.com"); err != nil {
		t.Fatalf("DeleteForwarder: %v", err)
	}
	if got := e.readFile(e.cfg.MailAliasesFile); got != "info@example.com keep@example.com\n" {
		t.Fatalf("aliases file after delete = %q", got)
	}
	e.assertAuditContains(`"action":"mail.forwarder.create"`, `"action":"mail.forwarder.delete"`,
		`"result":"accepted"`, `"result":"rejected"`)
}

func TestForwarderPreservesHandEdits(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	if err := os.MkdirAll(filepath.Dir(e.cfg.MailAliasesFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(e.cfg.MailAliasesFile, []byte("# hand written\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.CreateForwarder("info@example.com", "keep@example.com"); err != nil {
		t.Fatalf("CreateForwarder: %v", err)
	}
	got := e.readFile(e.cfg.MailAliasesFile)
	if !strings.Contains(got, "# hand written\n") || !strings.Contains(got, "info@example.com keep@example.com\n") {
		t.Fatalf("aliases file = %q, want comment and entry preserved", got)
	}
}

// ---- autoresponders ----

func TestAutorespondersCRUD(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")

	a, err := e.svc.SetAutoresponder(Autoresponder{
		Email:   "User@Example.COM",
		Subject: `Out of office "until Monday"`,
		Body:    "Line one.\n.line two\\with escapes",
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("SetAutoresponder: %v", err)
	}
	if a.Email != "user@example.com" || !a.Enabled || a.UpdatedAt.IsZero() {
		t.Fatalf("autoresponder = %+v, want normalized email and timestamp", a)
	}

	sieve := e.readFile(filepath.Join(e.cfg.MailAutoreplyDir, "user@example.com.sieve"))
	if !strings.Contains(sieve, "require [\"vacation\"];") {
		t.Fatalf("sieve script lacks the vacation require: %q", sieve)
	}
	if !strings.Contains(sieve, `:subject "Out of office \"until Monday\""`) {
		t.Fatalf("sieve script did not escape the subject: %q", sieve)
	}
	// The body is a dot-stuffed multi-line string: "\\with" survives and the
	// line starting with "." gains one more ".".
	if !strings.Contains(sieve, "Line one.\n..line two\\with escapes\n.\n;\n") {
		t.Fatalf("sieve script body = %q, want dot-stuffed multi-line string", sieve)
	}

	meta := e.readFile(filepath.Join(e.cfg.MailAutoreplyDir, "user@example.com.json"))
	var decoded Autoresponder
	if err := json.Unmarshal([]byte(meta), &decoded); err != nil {
		t.Fatalf("metadata is not valid JSON: %v", err)
	}
	if decoded.Email != "user@example.com" || decoded.Subject != a.Subject || decoded.Body != a.Body || !decoded.Enabled {
		t.Fatalf("metadata = %+v, want a full round trip", decoded)
	}

	got, err := e.svc.GetAutoresponder("USER@example.com")
	if err != nil {
		t.Fatalf("GetAutoresponder: %v", err)
	}
	if got.Subject != a.Subject || got.Body != a.Body || !got.Enabled {
		t.Fatalf("GetAutoresponder = %+v, want %+v", got, a)
	}

	// Upsert rewrites both files; disabling keeps a valid, inert script.
	a2, err := e.svc.SetAutoresponder(Autoresponder{Email: "user@example.com", Subject: "Second", Body: "Body two", Enabled: false})
	if err != nil {
		t.Fatalf("SetAutoresponder upsert: %v", err)
	}
	sieve = e.readFile(filepath.Join(e.cfg.MailAutoreplyDir, "user@example.com.sieve"))
	if strings.Contains(sieve, "text:") || !strings.Contains(sieve, "# autoresponder disabled") {
		t.Fatalf("disabled sieve = %q, want inert script", sieve)
	}
	if a2.Subject != "Second" {
		t.Fatalf("upsert did not rewrite metadata: %+v", a2)
	}

	_, err = e.svc.SetAutoresponder(Autoresponder{Email: "user@nolist.example", Subject: "x", Body: "y", Enabled: true})
	assertAPIErr(t, err, 404, "mail_domain_not_found")

	_, err = e.svc.SetAutoresponder(Autoresponder{Email: "user@example.com", Subject: "", Body: "y", Enabled: true})
	assertAPIErr(t, err, 400, "invalid_autoresponder")
	_, err = e.svc.SetAutoresponder(Autoresponder{Email: "user@example.com", Subject: "x", Body: strings.Repeat("b", 10001), Enabled: true})
	assertAPIErr(t, err, 400, "invalid_autoresponder")
	_, err = e.svc.SetAutoresponder(Autoresponder{Email: "bad email", Subject: "x", Body: "y", Enabled: true})
	assertAPIErr(t, err, 400, "invalid_email")

	_, err = e.svc.GetAutoresponder("gone@example.com")
	assertAPIErr(t, err, 404, "autoresponder_not_found")
	_, err = e.svc.GetAutoresponder("bad email")
	assertAPIErr(t, err, 400, "invalid_email")

	err = e.svc.DeleteAutoresponder("gone@example.com")
	assertAPIErr(t, err, 404, "autoresponder_not_found")
	if err := e.svc.DeleteAutoresponder("user@example.com"); err != nil {
		t.Fatalf("DeleteAutoresponder: %v", err)
	}
	for _, suffix := range []string{".sieve", ".json"} {
		if _, err := os.Stat(filepath.Join(e.cfg.MailAutoreplyDir, "user@example.com"+suffix)); !os.IsNotExist(err) {
			t.Fatalf("%s still present after delete", suffix)
		}
	}
	err = e.svc.DeleteAutoresponder("user@example.com")
	assertAPIErr(t, err, 404, "autoresponder_not_found")
	e.assertAuditContains(`"action":"mail.autoresponder.set"`, `"action":"mail.autoresponder.delete"`)
	e.assertAuditLacks(`"body":"Line one`)
}

func TestAutoresponderRejectsLineBreakSubject(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	_, err := e.svc.SetAutoresponder(Autoresponder{Email: "user@example.com", Subject: "a\nb", Body: "body", Enabled: true})
	assertAPIErr(t, err, 400, "invalid_autoresponder")
}

// ---- cross-cutting behavior ----

func TestDeleteDomainCascades(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	e.seedDomain("other.example")
	for _, address := range []string{"a@example.com", "b@other.example"} {
		if _, err := e.svc.CreateAccount(address, "s3cret-pass", 0); err != nil {
			t.Fatalf("CreateAccount(%s): %v", address, err)
		}
	}
	if err := e.svc.CreateForwarder("f@example.com", "keep@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.CreateForwarder("f@other.example", "keep@other.example"); err != nil {
		t.Fatal(err)
	}
	for _, address := range []string{"a@example.com", "b@other.example"} {
		if _, err := e.svc.SetAutoresponder(Autoresponder{Email: address, Subject: "Away", Body: "body", Enabled: true}); err != nil {
			t.Fatalf("SetAutoresponder(%s): %v", address, err)
		}
	}

	if err := e.svc.DeleteDomain("example.com"); err != nil {
		t.Fatalf("DeleteDomain: %v", err)
	}

	domains, _ := e.svc.ListDomains()
	if want := []string{"other.example"}; !reflect.DeepEqual(domains, want) {
		t.Fatalf("domains = %v, want %v", domains, want)
	}
	accounts, _ := e.svc.ListAccounts("")
	if len(accounts) != 1 || accounts[0].Email != "b@other.example" {
		t.Fatalf("accounts = %+v, want only b@other.example", accounts)
	}
	forwarders, _ := e.svc.ListForwarders("")
	if len(forwarders) != 1 || forwarders[0].Source != "f@other.example" {
		t.Fatalf("forwarders = %+v, want only f@other.example", forwarders)
	}
	for _, suffix := range []string{".sieve", ".json"} {
		if _, err := os.Stat(filepath.Join(e.cfg.MailAutoreplyDir, "a@example.com"+suffix)); !os.IsNotExist(err) {
			t.Fatalf("a@example.com%s still present", suffix)
		}
		if _, err := os.Stat(filepath.Join(e.cfg.MailAutoreplyDir, "b@other.example"+suffix)); err != nil {
			t.Fatalf("b@other.example%s missing: %v", suffix, err)
		}
	}
	// The deleted domain's maildir is kept on disk.
	if _, err := os.Stat(filepath.Join(e.cfg.MailVhostsDir, "a@example.com")); err != nil {
		t.Fatalf("maildir must be kept after domain delete: %v", err)
	}
	e.assertAuditContains(`"action":"mail.domain.delete"`, `"result":"accepted"`)
}

func TestStatusCounts(t *testing.T) {
	e := newEnv(t)
	e.seedDomain("example.com")
	e.seedDomain("other.example")
	if _, err := e.svc.CreateAccount("a@example.com", "s3cret-pass", 0); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(e.cfg.MailDkimDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(e.cfg.MailDkimDir, "example.com.key"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	status := e.svc.Status()
	if status.Domains != 2 || status.Accounts != 1 || status.DKIMEnabled != 1 {
		t.Fatalf("Status = %+v, want domains 2, accounts 1, dkim 1", status)
	}
}

func TestReloadCommandRunsAndFailuresAreLogged(t *testing.T) {
	e := newEnv(t)
	marker := filepath.Join(t.TempDir(), "marker.txt")
	// The stub records its argv into the marker file.
	stub := writeStub(t, "echo \"$@\" >> "+shQuote(marker)+"\n")
	e.cfg.MailReloadCmd = stub + " mail.reload"
	e.svc = New(e.cfg, e.auditLog, nil)
	e.seedDomain("example.com")
	if data, err := os.ReadFile(marker); err != nil || strings.TrimSpace(string(data)) != "mail.reload" {
		t.Fatalf("reload not invoked: %q, %v", data, err)
	}

	// A broken reload command is logged but never fails the mutation.
	e.cfg.MailReloadCmd = filepath.Join(t.TempDir(), "missing-reload-command")
	e.svc = New(e.cfg, e.auditLog, nil)
	if err := e.svc.AddDomain("other.example"); err != nil {
		t.Fatalf("AddDomain with broken reload must succeed: %v", err)
	}

	// An empty command runs nothing.
	e.cfg.MailReloadCmd = ""
	e.svc = New(e.cfg, e.auditLog, nil)
	e.seedDomain("third.example")
}

func TestDryRunRefusesMutations(t *testing.T) {
	e := newEnv(t)
	e.cfg.DryRun = true
	e.svc = New(e.cfg, e.auditLog, nil)

	mutations := []struct {
		name string
		call func() error
	}{
		{"AddDomain", func() error { return e.svc.AddDomain("example.com") }},
		{"DeleteDomain", func() error { return e.svc.DeleteDomain("example.com") }},
		{"CreateAccount", func() error {
			_, err := e.svc.CreateAccount("user@example.com", "s3cret-pass", 0)
			return err
		}},
		{"DeleteAccount", func() error { return e.svc.DeleteAccount("user@example.com") }},
		{"SetPassword", func() error { return e.svc.SetPassword("user@example.com", "s3cret-pass") }},
		{"SetQuota", func() error { return e.svc.SetQuota("user@example.com", 10) }},
		{"CreateForwarder", func() error { return e.svc.CreateForwarder("a@example.com", "b@example.com") }},
		{"DeleteForwarder", func() error { return e.svc.DeleteForwarder("a@example.com") }},
		{"SetAutoresponder", func() error {
			_, err := e.svc.SetAutoresponder(Autoresponder{Email: "a@example.com", Subject: "s", Body: "b"})
			return err
		}},
		{"DeleteAutoresponder", func() error { return e.svc.DeleteAutoresponder("a@example.com") }},
		{"ApplyDNS", func() error {
			_, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{SPF: true})
			return err
		}},
	}
	for _, mutation := range mutations {
		t.Run(mutation.name, func(t *testing.T) {
			assertAPIErr(t, mutation.call(), 409, "dry_run")
		})
	}

	// Reads still work, and no mail files or dirs were created.
	if domains, err := e.svc.ListDomains(); err != nil || len(domains) != 0 {
		t.Fatalf("ListDomains = %v, %v", domains, err)
	}
	if accounts, err := e.svc.ListAccounts(""); err != nil || len(accounts) != 0 {
		t.Fatalf("ListAccounts = %v, %v", accounts, err)
	}
	_, err := e.svc.GetAutoresponder("user@example.com")
	assertAPIErr(t, err, 404, "autoresponder_not_found")
	if _, err := os.Stat(e.cfg.MailRoot); !os.IsNotExist(err) {
		t.Fatalf("dry-run created mail state: %v", err)
	}
	e.assertAuditLacks(`"action":"mail.`)
}

// ---- DKIM + DNS ----

// dkimZoneOutput builds list-zone output for zone; includeDKIM adds the
// selector's TXT record.
func dkimZoneOutput(zone string, includeDKIM bool) string {
	out := "$ORIGIN .\n" +
		zone + ".\t3600\tIN\tSOA\tns1.example.com hostmaster.example.com 1 10800 3600 604800 3600\n" +
		zone + ".\t3600\tIN\tNS\tns1.example.com.\n"
	if includeDKIM {
		out += "clouddeck._domainkey." + zone + ".\t3600\tIN\tTXT\t\"v=DKIM1; k=rsa; p=placeholder\"\n"
	}
	return out
}

func TestApplyDNSPublishesPresets(t *testing.T) {
	e := newEnv(t)
	_, argvFile := e.withPdns(map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
		"list-zone":      {out: dkimZoneOutput("example.com", true)},
		"add-record":     {},
	})

	result, err := e.svc.ApplyDNS(context.Background(), "Example.COM", DNSOptions{
		SPF: true, DMARCPolicy: "quarantine", DKIM: true, MX: true,
	})
	if err != nil {
		t.Fatalf("ApplyDNS: %v", err)
	}
	if len(result.Errors) != 0 {
		t.Fatalf("errors = %v, want none", result.Errors)
	}
	want := map[string]string{
		"spf":   "v=spf1 a mx ~all",
		"dmarc": "v=DMARC1; p=quarantine",
		"mx":    "10 mx.test.example",
	}
	for part, value := range want {
		if result.Applied[part] != value {
			t.Fatalf("applied[%s] = %q, want %q (all: %v)", part, result.Applied[part], value, result.Applied)
		}
	}
	dkimValue := result.Applied["dkim"]
	if !strings.HasPrefix(dkimValue, "v=DKIM1; k=rsa; p=") {
		t.Fatalf("applied[dkim] = %q, want the DKIM1 TXT value", dkimValue)
	}
	if len(result.Applied) != 4 {
		t.Fatalf("applied = %v, want 4 records", result.Applied)
	}

	// Keypair, TXT file and metadata are on disk.
	keyData := e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.key"))
	block, _ := pem.Decode([]byte(keyData))
	if block == nil || block.Type != "PRIVATE KEY" {
		t.Fatalf("key is not a PKCS#8 PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		t.Fatalf("ParsePKCS8PrivateKey: %v", err)
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok || key.N.BitLen() != 2048 {
		t.Fatalf("key = %T/%d bits, want RSA 2048", parsed, key.N.BitLen())
	}
	if got := strings.TrimSpace(e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.txt"))); got != dkimValue {
		t.Fatalf("txt file = %q, want %q", got, dkimValue)
	}
	var meta struct {
		Domain    string `json:"domain"`
		Selector  string `json:"selector"`
		CreatedAt string `json:"createdAt"`
	}
	if err := json.Unmarshal([]byte(e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.json"))), &meta); err != nil {
		t.Fatalf("metadata: %v", err)
	}
	if meta.Domain != "example.com" || meta.Selector != "clouddeck" || meta.CreatedAt == "" {
		t.Fatalf("metadata = %+v", meta)
	}

	// The frozen pdnsutil argv: TTL 3600, relative names, quoted TXT.
	var sawSPF, sawMX, sawDMARC, sawDKIM bool
	for _, call := range readArgvs(t, argvFile) {
		if len(call) == 1 && call[0] == "list-all-zones" {
			continue // the zone existence probe
		}
		if len(call) != 6 || call[0] != "add-record" || call[1] != "example.com" {
			t.Fatalf("unexpected invocation %v", call)
		}
		switch {
		case call[2] == "@" && call[3] == "TXT":
			sawSPF = call[4] == "3600" && call[5] == `"v=spf1 a mx ~all"`
		case call[2] == "@" && call[3] == "MX":
			sawMX = call[4] == "3600" && call[5] == "10 mx.test.example"
		case call[2] == "_dmarc" && call[3] == "TXT":
			sawDMARC = call[4] == "3600" && call[5] == `"v=DMARC1; p=quarantine"`
		case call[2] == "clouddeck._domainkey" && call[3] == "TXT":
			sawDKIM = call[4] == "3600" && strings.HasPrefix(call[5], `"v=DKIM1; k=rsa; p=`)
		default:
			t.Fatalf("unexpected add-record invocation %v", call)
		}
	}
	if !sawSPF || !sawMX || !sawDMARC || !sawDKIM {
		t.Fatalf("missing add-record calls: spf=%v mx=%v dmarc=%v dkim=%v", sawSPF, sawMX, sawDMARC, sawDKIM)
	}

	e.assertAuditContains(`"action":"mail.dns.apply"`, `"result":"accepted"`, `"applied":4`)
}

func TestDKIMStatus(t *testing.T) {
	e := newEnv(t)
	_, _ = e.withPdns(map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
		"list-zone":      {out: dkimZoneOutput("example.com", true)},
		"add-record":     {},
	})
	result, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{DKIM: true})
	if err != nil {
		t.Fatalf("ApplyDNS: %v", err)
	}
	published := result.Applied["dkim"]

	info, err := e.svc.DKIMStatus("EXAMPLE.com")
	if err != nil {
		t.Fatalf("DKIMStatus: %v", err)
	}
	if !info.Enabled || info.Selector != "clouddeck" || info.Domain != "example.com" {
		t.Fatalf("info = %+v, want enabled with the clouddeck selector", info)
	}
	if info.DNSName != "clouddeck._domainkey.example.com" {
		t.Fatalf("dnsName = %q", info.DNSName)
	}
	if info.DNSRecord != published {
		t.Fatalf("dnsRecord = %q, want %q", info.DNSRecord, published)
	}
	if !info.DNSApplied {
		t.Fatalf("dnsApplied = false, want true (TXT record is in the zone)")
	}

	_, err = e.svc.DKIMStatus("not a domain")
	assertAPIErr(t, err, 400, "invalid_domain")
}

func TestDKIMStatusDisabledAndNotApplied(t *testing.T) {
	e := newEnv(t)
	// No key yet: enabled=false, no DNS lookup needed.
	info, err := e.svc.DKIMStatus("nokey.example")
	if err != nil {
		t.Fatalf("DKIMStatus: %v", err)
	}
	if info.Enabled || info.DNSName != "" || info.DNSRecord != "" || info.DNSApplied {
		t.Fatalf("info = %+v, want a disabled, bare entry", info)
	}

	// Key generated but the TXT record is absent from the zone.
	_, _ = e.withPdns(map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
		"list-zone":      {out: dkimZoneOutput("example.com", false)},
		"add-record":     {},
	})
	if _, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{DKIM: true}); err != nil {
		t.Fatalf("ApplyDNS: %v", err)
	}
	info, err = e.svc.DKIMStatus("example.com")
	if err != nil {
		t.Fatalf("DKIMStatus: %v", err)
	}
	if !info.Enabled || info.DNSApplied {
		t.Fatalf("info = %+v, want enabled with dnsApplied=false", info)
	}
}

func TestApplyDNSZoneMissing(t *testing.T) {
	e := newEnv(t)
	_, argvFile := e.withPdns(map[string]fakeReply{
		"list-all-zones": {out: "other.example\n"},
	})
	result, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{SPF: true, DKIM: true, MX: true})
	if err != nil {
		t.Fatalf("ApplyDNS: %v", err)
	}
	if len(result.Applied) != 0 {
		t.Fatalf("applied = %v, want none", result.Applied)
	}
	if len(result.Errors) != 1 || result.Errors[0] != "zone example.com not found" {
		t.Fatalf("errors = %v, want the zone-missing message", result.Errors)
	}
	// The local keypair is still created; no add-record ever runs.
	if _, err := os.Stat(filepath.Join(e.cfg.MailDkimDir, "example.com.key")); err != nil {
		t.Fatalf("DKIM key missing: %v", err)
	}
	want := [][]string{{"list-all-zones"}}
	if calls := readArgvs(t, argvFile); !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want only %v", calls, want)
	}
	e.assertAuditContains(`"action":"mail.dns.apply"`, `"result":"accepted"`, `"errors":["zone example.com not found"]`)
}

func TestApplyDNSValidationAndDryRun(t *testing.T) {
	e := newEnv(t)
	_, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{DMARCPolicy: "bogus"})
	assertAPIErr(t, err, 400, "invalid_request")
	_, err = e.svc.ApplyDNS(context.Background(), "not a domain", DNSOptions{SPF: true})
	assertAPIErr(t, err, 400, "invalid_domain")
	if _, err := os.Stat(e.cfg.MailDkimDir); !os.IsNotExist(err) {
		t.Fatalf("validation failure created DKIM state: %v", err)
	}
	e.assertAuditContains(`"action":"mail.dns.apply"`, `"result":"rejected"`)

	dry := newEnv(t)
	dry.cfg.DryRun = true
	dry.svc = New(dry.cfg, dry.auditLog, nil)
	_, err = dry.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{SPF: true})
	assertAPIErr(t, err, 409, "dry_run")
}

// TestDKIMKeyIsKept checks that re-applying DNS keeps the existing keypair
// and its metadata createdAt.
func TestDKIMKeyIsKept(t *testing.T) {
	e := newEnv(t)
	_, _ = e.withPdns(map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
		"list-zone":      {out: dkimZoneOutput("example.com", false)},
		"add-record":     {},
	})
	if _, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{DKIM: true}); err != nil {
		t.Fatal(err)
	}
	first := e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.key"))
	txtFirst := e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.txt"))

	if _, err := e.svc.ApplyDNS(context.Background(), "example.com", DNSOptions{DKIM: true}); err != nil {
		t.Fatal(err)
	}
	if second := e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.key")); second != first {
		t.Fatalf("existing DKIM key was regenerated")
	}
	if txtSecond := e.readFile(filepath.Join(e.cfg.MailDkimDir, "example.com.txt")); txtSecond != txtFirst {
		t.Fatalf("existing DKIM record changed: %q vs %q", txtSecond, txtFirst)
	}
}
