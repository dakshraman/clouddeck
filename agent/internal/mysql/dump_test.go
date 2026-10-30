package mysql

import (
	"bytes"
	"compress/gzip"
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

// writeFakeDumpClient writes a mock executable that records its argv and env,
// writes fake stdout and exits.
func writeFakeDumpClient(t *testing.T, stdoutMsg, stderrMsg string, exitCode int) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake client script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	outFile := filepath.Join(dir, "stdout.txt")
	if err := os.WriteFile(outFile, []byte(stdoutMsg), 0o644); err != nil {
		t.Fatalf("write stdout file: %v", err)
	}
	errFile := filepath.Join(dir, "stderr.txt")
	if err := os.WriteFile(errFile, []byte(stderrMsg), 0o644); err != nil {
		t.Fatalf("write stderr file: %v", err)
	}
	script := "#!/bin/sh\n" +
		"for a in \"$@\"; do printf 'ARG:%s\\n' \"$a\"; done\n" +
		"printf 'ENV:MYSQL_PWD=%s\\n' \"${MYSQL_PWD:-unset}\"\n" +
		"if [ -s " + shQuote(outFile) + " ]; then cat " + shQuote(outFile) + "; fi\n" +
		"if [ -s " + shQuote(errFile) + " ]; then cat " + shQuote(errFile) + " >&2; fi\n" +
		fmt.Sprintf("exit %d\n", exitCode)
	bin := filepath.Join(dir, "fake-dump")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake dump: %v", err)
	}
	return bin
}

// writeFakeImportClient writes a mock executable that captures stdin to a file
// and logs argv and env.
func writeFakeImportClient(t *testing.T, stdinCapturedFile, stderrMsg string, exitCode int) string {
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
		"cat > " + shQuote(stdinCapturedFile) + "\n" +
		"for a in \"$@\"; do printf 'ARG:%s\\n' \"$a\"; done >> " + shQuote(stdinCapturedFile) + ".meta\n" +
		"printf 'ENV:MYSQL_PWD=%s\\n' \"${MYSQL_PWD:-unset}\\n\" >> " + shQuote(stdinCapturedFile) + ".meta\n" +
		"if [ -s " + shQuote(errFile) + " ]; then cat " + shQuote(errFile) + " >&2; fi\n" +
		fmt.Sprintf("exit %d\n", exitCode)
	bin := filepath.Join(dir, "fake-import")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake import: %v", err)
	}
	return bin
}

func TestExportValidation(t *testing.T) {
	svc := New(nil, config.Config{MySQLBin: "mysql", MySQLDumpBin: "mysqldump"})

	var buf bytes.Buffer
	err := svc.Export(context.Background(), "invalid-name!", &buf)
	if err == nil {
		t.Fatal("Export(invalid) expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Code != "invalid_name" {
		t.Fatalf("expected invalid_name, got %v", err)
	}

	err = svc.Export(context.Background(), "mysql", &buf)
	if err == nil {
		t.Fatal("Export(system_schema) expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Code != "system_schema" {
		t.Fatalf("expected system_schema, got %v", err)
	}
}

func TestExportDatabaseNotFound(t *testing.T) {
	// Fake mysql client for SHOW DATABASES returning only otherdb
	fakeMysql := writeFakeDumpClient(t, "otherdb\n", "", 0)
	svc := New(nil, config.Config{
		MySQLBin:      fakeMysql,
		MySQLDumpBin:  fakeMysql,
		MySQLRootUser: "root",
	})

	var buf bytes.Buffer
	err := svc.Export(context.Background(), "appdb", &buf)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Status != 404 || apiErr.Code != "not_found" {
		t.Fatalf("expected 404 not_found, got %v", err)
	}
}

func TestExportMissingBinary(t *testing.T) {
	// Fake mysql client that says "appdb" exists
	fakeMysql := writeFakeDumpClient(t, "appdb\n", "", 0)
	svc := New(nil, config.Config{
		MySQLBin:      fakeMysql,
		MySQLDumpBin:  "/nonexistent/path/mysqldump",
		MySQLRootUser: "root",
	})

	var buf bytes.Buffer
	err := svc.Export(context.Background(), "appdb", &buf)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Status != 503 || apiErr.Code != "mysql_unavailable" {
		t.Fatalf("expected 503 mysql_unavailable, got %v", err)
	}
}

func TestExportSuccess(t *testing.T) {
	fakeMysql := writeFakeDumpClient(t, "appdb\n", "", 0)
	fakeDump := writeFakeDumpClient(t, "-- SQL DUMP CONTENT", "", 0)

	svc := New(nil, config.Config{
		MySQLBin:      fakeMysql,
		MySQLDumpBin:  fakeDump,
		MySQLRootUser: "admin",
		MySQLRootPass: "supersecret",
		MySQLHost:     "127.0.0.1",
		MySQLPort:     "3306",
	})

	var buf bytes.Buffer
	err := svc.Export(context.Background(), "appdb", &buf)
	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	out := buf.String()
	for _, want := range []string{
		"ARG:--single-transaction",
		"ARG:--quick",
		"ARG:--skip-lock-tables",
		"ARG:-u\nARG:admin",
		"ARG:-h\nARG:127.0.0.1",
		"ARG:-P\nARG:3306",
		"ARG:appdb",
		"ENV:MYSQL_PWD=supersecret",
		"-- SQL DUMP CONTENT",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("Export output missing %q:\n%s", want, out)
		}
	}
}

func TestImportValidation(t *testing.T) {
	svc := New(nil, config.Config{MySQLBin: "mysql"})

	err := svc.Import(context.Background(), "invalid-name!", strings.NewReader("SELECT 1;"))
	if err == nil {
		t.Fatal("Import(invalid) expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Code != "invalid_name" {
		t.Fatalf("expected invalid_name, got %v", err)
	}

	err = svc.Import(context.Background(), "mysql", strings.NewReader("SELECT 1;"))
	if err == nil {
		t.Fatal("Import(system_schema) expected error, got nil")
	}
	if apiErr, ok := apierr.As(err); !ok || apiErr.Code != "system_schema" {
		t.Fatalf("expected system_schema, got %v", err)
	}
}

func TestImportSuccessPlainSQL(t *testing.T) {
	dir := t.TempDir()
	capturedStdin := filepath.Join(dir, "stdin.sql")

	fakeImport := writeFakeImportClient(t, capturedStdin, "", 0)

	// A fake mysql dispatcher: if args have SHOW DATABASES, return appdb; else run fakeImport
	dispatcherScript := "#!/bin/sh\n" +
		"for arg in \"$@\"; do\n" +
		"  if [ \"$arg\" = 'SHOW DATABASES' ]; then\n" +
		"    echo 'appdb'\n" +
		"    exit 0\n" +
		"  fi\n" +
		"done\n" +
		"exec " + shQuote(fakeImport) + " \"$@\"\n"

	bin := filepath.Join(dir, "mysql-dispatcher")
	if err := os.WriteFile(bin, []byte(dispatcherScript), 0o755); err != nil {
		t.Fatalf("write dispatcher: %v", err)
	}

	svc := New(nil, config.Config{
		MySQLBin:      bin,
		MySQLRootUser: "admin",
		MySQLRootPass: "secretpass",
	})

	sqlData := "CREATE TABLE test (id int);\nINSERT INTO test VALUES (1);\n"
	err := svc.Import(context.Background(), "appdb", strings.NewReader(sqlData))
	if err != nil {
		t.Fatalf("Import failed: %v", err)
	}

	captured, err := os.ReadFile(capturedStdin)
	if err != nil {
		t.Fatalf("read captured stdin: %v", err)
	}
	if string(captured) != sqlData {
		t.Fatalf("captured stdin = %q, want %q", string(captured), sqlData)
	}

	meta, err := os.ReadFile(capturedStdin + ".meta")
	if err != nil {
		t.Fatalf("read meta: %v", err)
	}
	metaStr := string(meta)
	for _, want := range []string{
		"ARG:-u\nARG:admin",
		"ARG:appdb",
		"ENV:MYSQL_PWD=secretpass",
	} {
		if !strings.Contains(metaStr, want) {
			t.Errorf("Import missing metadata %q:\n%s", want, metaStr)
		}
	}
}

func TestImportSuccessGzipCompressed(t *testing.T) {
	dir := t.TempDir()
	capturedStdin := filepath.Join(dir, "stdin.sql")

	fakeImport := writeFakeImportClient(t, capturedStdin, "", 0)

	dispatcherScript := "#!/bin/sh\n" +
		"for arg in \"$@\"; do\n" +
		"  if [ \"$arg\" = 'SHOW DATABASES' ]; then\n" +
		"    echo 'appdb'\n" +
		"    exit 0\n" +
		"  fi\n" +
		"done\n" +
		"exec " + shQuote(fakeImport) + " \"$@\"\n"

	bin := filepath.Join(dir, "mysql-dispatcher")
	if err := os.WriteFile(bin, []byte(dispatcherScript), 0o755); err != nil {
		t.Fatalf("write dispatcher: %v", err)
	}

	svc := New(nil, config.Config{
		MySQLBin:      bin,
		MySQLRootUser: "admin",
	})

	rawSQL := "CREATE TABLE gz_test (id int);\n"
	var gzBuf bytes.Buffer
	gw := gzip.NewWriter(&gzBuf)
	if _, err := gw.Write([]byte(rawSQL)); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := gw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}

	err := svc.Import(context.Background(), "appdb", &gzBuf)
	if err != nil {
		t.Fatalf("Import gzip failed: %v", err)
	}

	captured, err := os.ReadFile(capturedStdin)
	if err != nil {
		t.Fatalf("read captured stdin: %v", err)
	}
	if string(captured) != rawSQL {
		t.Fatalf("captured decompressed stdin = %q, want %q", string(captured), rawSQL)
	}
}
