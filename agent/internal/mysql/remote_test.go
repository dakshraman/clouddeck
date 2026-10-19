package mysql

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// fakeResponse is one canned CLI answer: when the SQL statement sent with -e
// contains pattern, the fake client prints output instead of querying a
// server. Responses are tried in order, so put more specific patterns first.
type fakeResponse struct {
	pattern string
	output  string
}

// writeFakeQueryClient writes an executable stub client that records every
// argv entry and the -e statement (as "QUERY:<sql>" lines) to logFile, then
// answers canned SELECTs by pattern. No statement ever reaches a real server.
func writeFakeQueryClient(t *testing.T, responses []fakeResponse) (bin, logFile string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake client script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	logFile = filepath.Join(dir, "queries.log")

	var script strings.Builder
	script.WriteString("#!/bin/sh\n")
	script.WriteString("sql=''\nprev=''\n")
	script.WriteString("for a in \"$@\"; do\n")
	script.WriteString("  if [ \"$prev\" = '-e' ]; then sql=\"$a\"; fi\n")
	script.WriteString("  prev=\"$a\"\n")
	script.WriteString("done\n")
	script.WriteString("for a in \"$@\"; do printf 'ARG:%s\\n' \"$a\" >> " + shQuote(logFile) + "; done\n")
	script.WriteString("printf 'QUERY:%s\\n' \"$sql\" >> " + shQuote(logFile) + "\n")
	for i, r := range responses {
		respFile := filepath.Join(dir, fmt.Sprintf("response-%d.txt", i))
		if err := os.WriteFile(respFile, []byte(r.output), 0o644); err != nil {
			t.Fatalf("write response file: %v", err)
		}
		script.WriteString("if printf '%s' \"$sql\" | grep -qF " + shQuote(r.pattern) +
			"; then cat " + shQuote(respFile) + "; exit 0; fi\n")
	}
	script.WriteString("exit 0\n")

	bin = filepath.Join(dir, "fake-mysql")
	if err := os.WriteFile(bin, []byte(script.String()), 0o755); err != nil {
		t.Fatalf("write fake client: %v", err)
	}
	return bin, logFile
}

// newRemoteHarness wires a Service to the fake client and a real audit log in
// temp storage, returning the service, the client query log and the audit log
// path.
func newRemoteHarness(t *testing.T, responses []fakeResponse, mutate func(*config.Config)) (*Service, string, string) {
	t.Helper()
	bin, logFile := writeFakeQueryClient(t, responses)
	stateDir := t.TempDir()
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{MySQLBin: bin, MySQLRootUser: "root"}
	if mutate != nil {
		mutate(&cfg)
	}
	return New(auditLog, cfg), logFile, filepath.Join(stateDir, "audit.log")
}

// mustReadFile reads path, failing the test when it is missing.
func mustReadFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

// wantAPIError asserts that err is an *apierr.Error with the given status and
// code.
func wantAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("got nil error, want %d/%s", status, code)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s (message %q), want %d/%s", apiErr.Status, apiErr.Code, apiErr.Message, status, code)
	}
}

// assertClientDidNotRun checks that a rejected request never invoked the
// client (its script only creates the log when it is actually executed).
func assertClientDidNotRun(t *testing.T, logFile string) {
	t.Helper()
	if _, err := os.Stat(logFile); !os.IsNotExist(err) {
		t.Errorf("client ran although the request was rejected before running queries (stat: %v)", err)
	}
}

const (
	fakeMariaDBVersion = "11.4.2-MariaDB-ubu2404"
	fakeNativeHash     = "*94BDCEBE19083CE2A1F959FD02F964C7AF4CFC29"
)

func TestRemoteHostsQueriesAndSorts(t *testing.T) {
	out := "zoe\t10.0.0.9\n" +
		"alice\t%\n" +
		"\t1.2.3.4\n" +
		"root\t8.8.8.8\n" +
		"mysql.sys\t10.0.0.1\n"
	svc, logFile, _ := newRemoteHarness(t, []fakeResponse{
		{pattern: "WHERE Host NOT IN", output: out},
	}, nil)

	users, err := svc.RemoteHosts(context.Background())
	if err != nil {
		t.Fatalf("RemoteHosts: %v", err)
	}
	want := []User{{User: "alice", Host: "%"}, {User: "zoe", Host: "10.0.0.9"}}
	if len(users) != len(want) {
		t.Fatalf("RemoteHosts = %v, want %v", users, want)
	}
	for i := range want {
		if users[i] != want[i] {
			t.Fatalf("RemoteHosts[%d] = %v, want %v", i, users[i], want[i])
		}
	}

	log := mustReadFile(t, logFile)
	if !strings.Contains(log, "QUERY:"+remoteHostsQuery) {
		t.Errorf("client log misses the exact remote-host query:\n%s", log)
	}
}

func TestAddRemoteHostMariaDBClonesHashAndGrants(t *testing.T) {
	grants := "GRANT USAGE ON *.* TO 'alice'@'localhost' IDENTIFIED BY PASSWORD '" + fakeNativeHash + "'\n" +
		"GRANT ALL PRIVILEGES ON `appdb`.* TO 'alice'@'localhost'\n" +
		"GRANT SELECT, INSERT ON `appdb`.`orders` TO 'alice'@'localhost' WITH GRANT OPTION\n" +
		"GRANT SELECT ON `other`.* TO 'bob'@'localhost'\n"
	svc, logFile, auditFile := newRemoteHarness(t, []fakeResponse{
		{pattern: "SELECT VERSION()", output: fakeMariaDBVersion + "\n"},
		{pattern: "SELECT COUNT(*)", output: "1\n"},
		{pattern: "SELECT plugin, authentication_string", output: "mysql_native_password\t" + fakeNativeHash + "\n"},
		{pattern: "SHOW GRANTS", output: grants},
		{pattern: "SELECT User, Host FROM mysql.user", output: "alice\tlocalhost\n"},
	}, nil)

	got, err := svc.AddRemoteHost(context.Background(), "alice", "%")
	if err != nil {
		t.Fatalf("AddRemoteHost: %v", err)
	}
	if got != (User{User: "alice", Host: "%"}) {
		t.Fatalf("AddRemoteHost = %v, want alice@%%", got)
	}

	log := mustReadFile(t, logFile)
	for _, want := range []string{
		"QUERY:SELECT COUNT(*) FROM mysql.user WHERE User='alice' AND Host='localhost'",
		"QUERY:SELECT plugin, authentication_string FROM mysql.user WHERE User='alice' AND Host='localhost'",
		"QUERY:SHOW GRANTS FOR 'alice'@'localhost'",
		"QUERY:CREATE USER 'alice'@'%' IDENTIFIED BY PASSWORD '" + fakeNativeHash + "'",
		"QUERY:GRANT USAGE ON *.* TO 'alice'@'%'",
		"QUERY:GRANT ALL PRIVILEGES ON `appdb`.* TO 'alice'@'%'",
		"QUERY:GRANT SELECT, INSERT ON `appdb`.`orders` TO 'alice'@'%' WITH GRANT OPTION",
	} {
		if !strings.Contains(log, want) {
			t.Errorf("client log misses %q:\n%s", want, log)
		}
	}
	for _, unwanted := range []string{
		"TO 'alice'@'%' IDENTIFIED",
		"'bob'@'%'",
	} {
		if strings.Contains(log, unwanted) {
			t.Errorf("client log contains %q, which must not be replayed:\n%s", unwanted, log)
		}
	}

	auditData := mustReadFile(t, auditFile)
	if !strings.Contains(auditData, `"action":"mysql.remote.add"`) || !strings.Contains(auditData, `"result":"accepted"`) {
		t.Errorf("audit log misses the accepted add record:\n%s", auditData)
	}
}

func TestAddRemoteHostMySQLUsesPluginSyntax(t *testing.T) {
	hash := "$A$005$abcdefghijklmnopqrstuv/wx.0123456789ABCDEF"
	grants := "GRANT USAGE ON *.* TO `alice`@`localhost`\n" +
		"GRANT ALL PRIVILEGES ON `appdb`.* TO `alice`@`localhost`\n" +
		"GRANT CREATE, DROP ON `appdb`.* TO `alice`@`localhost` WITH GRANT OPTION\n"
	svc, logFile, auditFile := newRemoteHarness(t, []fakeResponse{
		{pattern: "SELECT VERSION()", output: "8.0.36\n"},
		{pattern: "SELECT COUNT(*)", output: "1\n"},
		{pattern: "SELECT plugin, authentication_string", output: "caching_sha2_password\t" + hash + "\n"},
		{pattern: "SHOW GRANTS", output: grants},
		{pattern: "SELECT User, Host FROM mysql.user", output: "alice\tlocalhost\n"},
	}, nil)

	got, err := svc.AddRemoteHost(context.Background(), "alice", "db.example.com")
	if err != nil {
		t.Fatalf("AddRemoteHost: %v", err)
	}
	if got != (User{User: "alice", Host: "db.example.com"}) {
		t.Fatalf("AddRemoteHost = %v, want alice@db.example.com", got)
	}

	log := mustReadFile(t, logFile)
	for _, want := range []string{
		"QUERY:CREATE USER 'alice'@'db.example.com' IDENTIFIED WITH caching_sha2_password AS '" + hash + "'",
		"QUERY:GRANT ALL PRIVILEGES ON `appdb`.* TO 'alice'@'db.example.com'",
		"QUERY:GRANT CREATE, DROP ON `appdb`.* TO 'alice'@'db.example.com' WITH GRANT OPTION",
	} {
		if !strings.Contains(log, want) {
			t.Errorf("client log misses %q:\n%s", want, log)
		}
	}

	auditData := mustReadFile(t, auditFile)
	if !strings.Contains(auditData, `"action":"mysql.remote.add"`) {
		t.Errorf("audit log misses the accepted add record:\n%s", auditData)
	}
}

func TestAddRemoteHostErrors(t *testing.T) {
	tests := []struct {
		name      string
		user      string
		host      string
		dryRun    bool
		responses []fakeResponse
		status    int
		code      string
		invoked   bool
	}{
		{name: "invalid user", user: "bad user", host: "%", status: 400, code: "invalid_user"},
		{name: "user with quote", user: "al'ice", host: "%", status: 400, code: "invalid_user"},
		{name: "system user", user: "root", host: "%", status: 400, code: "invalid_user"},
		{name: "invalid host", user: "alice", host: "bad host", status: 400, code: "invalid_host"},
		{name: "host with quote", user: "alice", host: "bad'host", status: 400, code: "invalid_host"},
		{name: "localhost", user: "alice", host: "localhost", status: 400, code: "invalid_host_local"},
		{name: "loopback v4", user: "alice", host: "127.0.0.1", status: 400, code: "invalid_host_local"},
		{name: "loopback v6", user: "alice", host: "::1", status: 400, code: "invalid_host_local"},
		{name: "empty host", user: "alice", host: "", status: 400, code: "invalid_host_local"},
		{name: "dry run", user: "alice", host: "%", dryRun: true, status: 409, code: "dry_run"},
		{
			name:      "local user missing",
			user:      "alice",
			host:      "%",
			responses: []fakeResponse{{pattern: "SELECT COUNT(*)", output: "0\n"}},
			status:    404,
			code:      "mysql_user_not_found",
			invoked:   true,
		},
		{
			name: "target exists",
			user: "alice",
			host: "%",
			responses: []fakeResponse{
				{pattern: "SELECT COUNT(*)", output: "1\n"},
				{pattern: "SELECT User, Host FROM mysql.user", output: "alice\t%\n"},
			},
			status:  409,
			code:    "mysql_user_exists",
			invoked: true,
		},
		{
			name: "no password hash",
			user: "alice",
			host: "%",
			responses: []fakeResponse{
				{pattern: "SELECT COUNT(*)", output: "1\n"},
				{pattern: "SELECT User, Host FROM mysql.user", output: "alice\tlocalhost\n"},
				{pattern: "SELECT plugin, authentication_string", output: "mysql_native_password\t\n"},
			},
			status:  400,
			code:    "invalid_user",
			invoked: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, logFile, _ := newRemoteHarness(t, tt.responses, func(cfg *config.Config) {
				cfg.DryRun = tt.dryRun
			})
			_, err := svc.AddRemoteHost(context.Background(), tt.user, tt.host)
			wantAPIError(t, err, tt.status, tt.code)
			if !tt.invoked {
				assertClientDidNotRun(t, logFile)
			}
		})
	}
}

func TestDeleteRemoteHost(t *testing.T) {
	svc, logFile, auditFile := newRemoteHarness(t, []fakeResponse{
		{pattern: "SELECT User, Host FROM mysql.user", output: "alice\t%\nbob\tlocalhost\n"},
	}, nil)

	got, err := svc.DeleteRemoteHost(context.Background(), "alice", "%")
	if err != nil {
		t.Fatalf("DeleteRemoteHost: %v", err)
	}
	if got != (User{User: "alice", Host: "%"}) {
		t.Fatalf("DeleteRemoteHost = %v, want alice@%%", got)
	}

	log := mustReadFile(t, logFile)
	if !strings.Contains(log, "QUERY:DROP USER 'alice'@'%'") {
		t.Errorf("client log misses the drop statement:\n%s", log)
	}
	auditData := mustReadFile(t, auditFile)
	if !strings.Contains(auditData, `"action":"mysql.remote.delete"`) || !strings.Contains(auditData, `"result":"accepted"`) {
		t.Errorf("audit log misses the accepted delete record:\n%s", auditData)
	}
}

func TestDeleteRemoteHostErrors(t *testing.T) {
	tests := []struct {
		name      string
		user      string
		host      string
		dryRun    bool
		responses []fakeResponse
		status    int
		code      string
		invoked   bool
	}{
		{name: "invalid user", user: "bad user", host: "%", status: 400, code: "invalid_user"},
		{name: "system user", user: "root", host: "%", status: 400, code: "invalid_user"},
		{name: "invalid host", user: "alice", host: "bad host", status: 400, code: "invalid_host"},
		{name: "local host", user: "alice", host: "localhost", status: 400, code: "invalid_host_local"},
		{name: "loopback v4", user: "alice", host: "127.0.0.1", status: 400, code: "invalid_host_local"},
		{name: "dry run", user: "alice", host: "%", dryRun: true, status: 409, code: "dry_run"},
		{
			name:      "missing",
			user:      "alice",
			host:      "%",
			responses: []fakeResponse{{pattern: "SELECT User, Host FROM mysql.user", output: "bob\t%\n"}},
			status:    404,
			code:      "mysql_user_not_found",
			invoked:   true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, logFile, _ := newRemoteHarness(t, tt.responses, func(cfg *config.Config) {
				cfg.DryRun = tt.dryRun
			})
			_, err := svc.DeleteRemoteHost(context.Background(), tt.user, tt.host)
			wantAPIError(t, err, tt.status, tt.code)
			if !tt.invoked {
				assertClientDidNotRun(t, logFile)
			}
		})
	}
}

func TestTranslateGrant(t *testing.T) {
	tests := []struct {
		name string
		line string
		want string
	}{
		{
			name: "mariadb usage line drops the identified clause",
			line: "GRANT USAGE ON *.* TO 'alice'@'localhost' IDENTIFIED BY PASSWORD '*HASH'",
			want: "GRANT USAGE ON *.* TO 'alice'@'%'",
		},
		{
			name: "mariadb identified before with grant option",
			line: "GRANT ALL PRIVILEGES ON *.* TO 'alice'@'localhost' IDENTIFIED BY PASSWORD '*HASH' WITH GRANT OPTION",
			want: "GRANT ALL PRIVILEGES ON *.* TO 'alice'@'%' WITH GRANT OPTION",
		},
		{
			name: "mysql backticked line",
			line: "GRANT ALL PRIVILEGES ON `appdb`.* TO `alice`@`localhost`",
			want: "GRANT ALL PRIVILEGES ON `appdb`.* TO 'alice'@'%'",
		},
		{
			name: "table scope and with grant option",
			line: "GRANT SELECT, INSERT ON `appdb`.`orders` TO 'alice'@'LOCALHOST' WITH GRANT OPTION",
			want: "GRANT SELECT, INSERT ON `appdb`.`orders` TO 'alice'@'%' WITH GRANT OPTION",
		},
		{name: "different account is skipped", line: "GRANT SELECT ON `appdb`.* TO 'bob'@'localhost'", want: ""},
		{name: "different host is skipped", line: "GRANT SELECT ON `appdb`.* TO 'alice'@'192.168.1.5'", want: ""},
		{name: "non grant line is skipped", line: "REVOKE SELECT ON `appdb`.* FROM 'alice'@'localhost'", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := translateGrant(tt.line, "alice", "%"); got != tt.want {
				t.Fatalf("translateGrant(%q) = %q, want %q", tt.line, got, tt.want)
			}
		})
	}
}
