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
	"clouddeck/agent/internal/config"
)

// checkValue asserts the result of an identifier validation call: either the
// normalized value with no error, or an API error with the wanted code.
func checkValue(t *testing.T, got string, err error, want, wantCode string) {
	t.Helper()
	if wantCode == "" {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
		return
	}
	if err == nil {
		t.Fatalf("got %q with nil error, want error code %q", got, wantCode)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Code != wantCode {
		t.Fatalf("error code = %q, want %q (message %q)", apiErr.Code, wantCode, apiErr.Message)
	}
	if apiErr.Status != 400 {
		t.Fatalf("error status = %d, want 400", apiErr.Status)
	}
}

func TestValidateDatabase(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantCode string
	}{
		{name: "simple", input: "appdb", want: "appdb"},
		{name: "mixed case digits underscore", input: "App_1", want: "App_1"},
		{name: "trims whitespace", input: "  appdb  ", want: "appdb"},
		{name: "max length", input: strings.Repeat("a", 64), want: strings.Repeat("a", 64)},
		{name: "empty", input: "", wantCode: "invalid_name"},
		{name: "too long", input: strings.Repeat("a", 65), wantCode: "invalid_name"},
		{name: "dash", input: "my-db", wantCode: "invalid_name"},
		{name: "dot", input: "my.db", wantCode: "invalid_name"},
		{name: "space inside", input: "my db", wantCode: "invalid_name"},
		{name: "non ascii", input: "café", wantCode: "invalid_name"},
		{name: "backtick", input: "db`x", wantCode: "invalid_name"},
		{name: "sql statement", input: "db; DROP DATABASE mysql", wantCode: "invalid_name"},
		{name: "newline", input: "db\nname", wantCode: "invalid_name"},
		{name: "system mysql", input: "mysql", wantCode: "system_schema"},
		{name: "system mixed case", input: "MySQL", wantCode: "system_schema"},
		{name: "system information_schema", input: "information_schema", wantCode: "system_schema"},
		{name: "system performance_schema", input: "PERFORMANCE_SCHEMA", wantCode: "system_schema"},
		{name: "system sys", input: "sys", wantCode: "system_schema"},
		{name: "system padded", input: " sys ", wantCode: "system_schema"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidateDatabase(tt.input)
			checkValue(t, got, err, tt.want, tt.wantCode)
		})
	}
}

func TestValidateUser(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantCode string
	}{
		{name: "simple", input: "alice", want: "alice"},
		{name: "underscores and digits", input: "svc_user_1", want: "svc_user_1"},
		{name: "trims whitespace", input: " bob ", want: "bob"},
		{name: "max length", input: strings.Repeat("u", 32), want: strings.Repeat("u", 32)},
		{name: "empty", input: "", wantCode: "invalid_name"},
		{name: "too long", input: strings.Repeat("u", 33), wantCode: "invalid_name"},
		{name: "dash", input: "svc-user", wantCode: "invalid_name"},
		{name: "dot", input: "svc.user", wantCode: "invalid_name"},
		{name: "at sign", input: "user@host", wantCode: "invalid_name"},
		{name: "space inside", input: "al ice", wantCode: "invalid_name"},
		{name: "quote", input: "al'ice", wantCode: "invalid_name"},
		{name: "system root", input: "root", wantCode: "system_user"},
		{name: "system root upper", input: "ROOT", wantCode: "system_user"},
		{name: "system mysql.sys", input: "mysql.sys", wantCode: "system_user"},
		{name: "system mysql.session", input: "mysql.session", wantCode: "system_user"},
		{name: "system mysql.infoschema", input: "mysql.infoschema", wantCode: "system_user"},
		{name: "system mariadb.sys mixed case", input: "MariaDB.SYS", wantCode: "system_user"},
		{name: "system debian-sys-maint", input: "debian-sys-maint", wantCode: "system_user"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidateUser(tt.input)
			checkValue(t, got, err, tt.want, tt.wantCode)
		})
	}
}

func TestValidateHost(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantCode string
	}{
		{name: "empty defaults to localhost", input: "", want: "localhost"},
		{name: "blank defaults to localhost", input: "   ", want: "localhost"},
		{name: "localhost", input: "localhost", want: "localhost"},
		{name: "ipv4", input: "127.0.0.1", want: "127.0.0.1"},
		{name: "wildcard percent", input: "%", want: "%"},
		{name: "subnet wildcard", input: "192.168.1.%", want: "192.168.1.%"},
		{name: "domain wildcard", input: "%.example.com", want: "%.example.com"},
		{name: "with port", input: "db.internal:3306", want: "db.internal:3306"},
		{name: "dash and digits", input: "web-1", want: "web-1"},
		{name: "max length", input: strings.Repeat("h", 255), want: strings.Repeat("h", 255)},
		{name: "too long", input: strings.Repeat("h", 256), wantCode: "invalid_name"},
		{name: "space inside", input: "bad host", wantCode: "invalid_name"},
		{name: "slash", input: "bad/host", wantCode: "invalid_name"},
		{name: "single quote", input: "bad'host", wantCode: "invalid_name"},
		{name: "backtick", input: "bad`host", wantCode: "invalid_name"},
		{name: "semicolon", input: "a;b", wantCode: "invalid_name"},
		{name: "nul byte", input: "bad\x00host", wantCode: "invalid_name"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidateHost(tt.input)
			checkValue(t, got, err, tt.want, tt.wantCode)
		})
	}
}

func TestCheckPassword(t *testing.T) {
	valid := []string{
		"abcd1234",
		"Ab1!@#$%^&*()_+-=.,?",
		"aaaaaaaa",
		"p@ssw0rd!",
		strings.Repeat("a", 64),
	}
	for _, password := range valid {
		if err := checkPassword(password); err != nil {
			t.Errorf("checkPassword(%q) = %v, want valid", password, err)
		}
	}

	invalid := []string{
		"",
		"short7",
		strings.Repeat("a", 65),
		"has space1",
		"quote'quote1",
		"double\"quote1",
		`back\slash1`,
		"pässword123",
		"tab\tchar123",
	}
	for _, password := range invalid {
		err := checkPassword(password)
		if err == nil {
			t.Errorf("checkPassword(%q) = nil, want weak_password", password)
			continue
		}
		apiErr, ok := apierr.As(err)
		if !ok || apiErr.Code != "weak_password" || apiErr.Status != 400 {
			t.Errorf("checkPassword(%q) = %v, want 400 weak_password", password, err)
		}
	}
}

func TestGeneratePassword(t *testing.T) {
	const calls = 200
	seen := make(map[string]bool, calls)
	for i := 0; i < calls; i++ {
		password, err := generatePassword()
		if err != nil {
			t.Fatalf("generatePassword: %v", err)
		}
		if len(password) != generatedPasswordLen {
			t.Fatalf("len(%q) = %d, want %d", password, len(password), generatedPasswordLen)
		}
		for _, r := range password {
			if !strings.ContainsRune(passwordAlphabet, r) {
				t.Fatalf("password %q contains %q outside [A-Za-z0-9]", password, r)
			}
		}
		if err := checkPassword(password); err != nil {
			t.Fatalf("generated password %q rejected by policy: %v", password, err)
		}
		if seen[password] {
			t.Fatalf("generated password collision after %d calls: %q", i, password)
		}
		seen[password] = true
	}
}

func TestSystemDenylists(t *testing.T) {
	for _, name := range []string{"mysql", "MySQL", "MYSQL", "information_schema", "INFORMATION_SCHEMA", "performance_schema", "Sys", "sys"} {
		if !IsSystemSchema(name) {
			t.Errorf("IsSystemSchema(%q) = false, want true", name)
		}
	}
	for _, name := range []string{"", "mydb", "app_1", "mysql2", "sys2", "information_schemas", "performance"} {
		if IsSystemSchema(name) {
			t.Errorf("IsSystemSchema(%q) = true, want false", name)
		}
	}

	for _, user := range []string{"root", "ROOT", "Root", "mysql.sys", "mysql.session", "mysql.infoschema", "MARIADB.SYS", "debian-sys-maint", "Debian-Sys-Maint"} {
		if !IsSystemUser(user) {
			t.Errorf("IsSystemUser(%q) = false, want true", user)
		}
	}
	for _, user := range []string{"", "alice", "admin", "roots", "myroot", "mysql_sys"} {
		if IsSystemUser(user) {
			t.Errorf("IsSystemUser(%q) = true, want false", user)
		}
	}
}

func TestParseUsersFiltersSystemAccounts(t *testing.T) {
	out := "root\tlocalhost\n" +
		"alice\t%\n" +
		"\tlocalhost\n" +
		"mysql.sys\tlocalhost\n" +
		"bob\t192.168.1.5\n" +
		"debian-sys-maint\tlocalhost\n" +
		"svc\t\n"
	users := parseUsers(out)
	want := []User{{User: "alice", Host: "%"}, {User: "bob", Host: "192.168.1.5"}}
	if len(users) != len(want) {
		t.Fatalf("parseUsers = %v, want %v", users, want)
	}
	for i := range want {
		if users[i] != want[i] {
			t.Fatalf("parseUsers[%d] = %v, want %v", i, users[i], want[i])
		}
	}
}

func TestTailText(t *testing.T) {
	if got := tailText(""); got != "" {
		t.Errorf("tailText(\"\") = %q, want empty", got)
	}
	if got := tailText("ERROR 1045:\nAccess denied\tfor user"); got != "ERROR 1045: Access denied for user" {
		t.Errorf("tailText collapsed = %q, want single line", got)
	}

	long := "START" + strings.Repeat("x", 350) + "END"
	got := tailText(long)
	if len([]rune(got)) != stderrTailRunes+3 {
		t.Errorf("len(tailText(long)) = %d runes, want %d", len([]rune(got)), stderrTailRunes+3)
	}
	if !strings.HasPrefix(got, "...") {
		t.Errorf("tailText(long) = %q..., want leading ellipsis marking truncation", got[:10])
	}
	if !strings.HasSuffix(got, "END") {
		t.Errorf("tailText(long) does not keep the end of stderr: %q", got[len(got)-10:])
	}
}

func TestStatusWithMissingClient(t *testing.T) {
	svc := New(nil, config.Config{MySQLBin: "clouddeck-no-such-mysql-client"})
	got := svc.Status()
	if got.Available || got.Version != "" || got.Kind != "" {
		t.Fatalf("Status() = %+v, want available=false with empty version and kind", got)
	}
}

func TestRunWithMissingClientIsUnavailable(t *testing.T) {
	svc := New(nil, config.Config{MySQLBin: "clouddeck-no-such-mysql-client"})
	_, err := svc.run(context.Background(), "SELECT 1")
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("run error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != 503 || apiErr.Code != "mysql_unavailable" {
		t.Fatalf("got %d/%s, want 503/mysql_unavailable", apiErr.Status, apiErr.Code)
	}
}

// writeFakeClient writes an executable stub client that prints its argv and
// the MYSQL_PWD value to stdout, copies stderrMsg to stderr and exits with
// exitCode. Tests use it to exercise argument handling and error mapping
// without a live database server.
func writeFakeClient(t *testing.T, stderrMsg string, exitCode int) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake client script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	errFile := filepath.Join(dir, "stderr.txt")
	if err := os.WriteFile(errFile, []byte(stderrMsg), 0o644); err != nil {
		t.Fatalf("write stderr file: %v", err)
	}
	script := "#!/bin/sh\n" +
		"for a in \"$@\"; do printf 'ARG:%s\\n' \"$a\"; done\n" +
		"printf 'ENV:MYSQL_PWD=%s\\n' \"${MYSQL_PWD:-unset}\"\n" +
		"if [ -s " + shQuote(errFile) + " ]; then cat " + shQuote(errFile) + " >&2; fi\n" +
		fmt.Sprintf("exit %d\n", exitCode)
	bin := filepath.Join(dir, "fake-mysql")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake client: %v", err)
	}
	return bin
}

// shQuote wraps s in single quotes for POSIX sh.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func TestRunPassesArgsAndPasswordViaEnv(t *testing.T) {
	bin := writeFakeClient(t, "", 0)
	svc := New(nil, config.Config{
		MySQLBin:      bin,
		MySQLRootUser: "admin",
		MySQLRootPass: "s3cret-pw",
		MySQLHost:     "db.internal",
		MySQLPort:     "3307",
	})
	out, err := svc.run(context.Background(), "SELECT 1")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	for _, want := range []string{
		"ARG:--batch",
		"ARG:--skip-column-names",
		"ARG:-u\nARG:admin", // flag and value as separate argv entries
		"ARG:-h\nARG:db.internal",
		"ARG:-P\nARG:3307",
		"ARG:-e\nARG:SELECT 1",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("client argv missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "ARG:s3cret-pw") {
		t.Errorf("root password leaked into argv:\n%s", out)
	}
	if !strings.Contains(out, "ENV:MYSQL_PWD=s3cret-pw") {
		t.Errorf("root password not passed via MYSQL_PWD:\n%s", out)
	}
}

func TestRunOmitsOptionalFlags(t *testing.T) {
	t.Setenv("MYSQL_PWD", "")
	bin := writeFakeClient(t, "", 0)
	svc := New(nil, config.Config{MySQLBin: bin, MySQLRootUser: "root"})
	out, err := svc.run(context.Background(), "SHOW DATABASES")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if strings.Contains(out, "ARG:-h") || strings.Contains(out, "ARG:-P") {
		t.Errorf("host/port flags passed although unset:\n%s", out)
	}
	if !strings.Contains(out, "ENV:MYSQL_PWD=unset") {
		t.Errorf("MYSQL_PWD set although no password is configured:\n%s", out)
	}
}

func TestRunErrorMapping(t *testing.T) {
	tests := []struct {
		name   string
		stderr string
		status int
		code   string
	}{
		{
			name:   "connection refused",
			stderr: "ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/run/mysqld/mysqld.sock' (2)",
			status: 503,
			code:   "mysql_unavailable",
		},
		{
			name:   "unknown socket",
			stderr: "ERROR 2002 (HY000): Unknown socket error",
			status: 503,
			code:   "mysql_unavailable",
		},
		{
			name:   "other client failure",
			stderr: "ERROR 1064 (42000) at line 1: You have an error in your SQL syntax",
			status: 500,
			code:   "mysql_error",
		},
		{
			name:   "empty stderr",
			stderr: "",
			status: 500,
			code:   "mysql_error",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bin := writeFakeClient(t, tt.stderr, 1)
			svc := New(nil, config.Config{MySQLBin: bin, MySQLRootUser: "root"})
			_, err := svc.run(context.Background(), "SELECT 1")
			apiErr, ok := apierr.As(err)
			if !ok {
				t.Fatalf("run error %v is not an *apierr.Error", err)
			}
			if apiErr.Status != tt.status || apiErr.Code != tt.code {
				t.Fatalf("got %d/%s, want %d/%s (message %q)", apiErr.Status, apiErr.Code, tt.status, tt.code, apiErr.Message)
			}
		})
	}
}
