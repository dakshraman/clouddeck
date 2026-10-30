package server

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mysql"
)

func writeMockScript(t *testing.T, body string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("mock script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "mock-bin")
	script := "#!/bin/sh\n" + body
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write mock script: %v", err)
	}
	return bin
}

func TestServerMySQLExport(t *testing.T) {
	mockScript := writeMockScript(t, `
for arg in "$@"; do
  if [ "$arg" = 'SHOW DATABASES' ]; then
    echo "testdb"
    exit 0
  fi
done
echo "-- MOCK DUMP --"
`)

	mysqlSvc := mysql.New(nil, config.Config{
		MySQLBin:      mockScript,
		MySQLDumpBin:  mockScript,
		MySQLRootUser: "root",
	})
	s := &Server{mysql: mysqlSvc}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/mysql/databases/{name}/export", s.handleMySQLExportDatabase)

	t.Run("success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mysql/databases/testdb/export", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
		}
		if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/sql") {
			t.Errorf("Content-Type = %q, want application/sql", ct)
		}
		wantDisp := `attachment; filename="testdb.sql"`
		if disp := rec.Header().Get("Content-Disposition"); disp != wantDisp {
			t.Errorf("Content-Disposition = %q, want %q", disp, wantDisp)
		}
		if !strings.Contains(rec.Body.String(), "-- MOCK DUMP --") {
			t.Errorf("body missing mock dump: %s", rec.Body.String())
		}
	})

	t.Run("database not found", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mysql/databases/missingdb/export", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		if !strings.Contains(rec.Body.String(), "not_found") {
			t.Errorf("expected not_found error code, got %s", rec.Body.String())
		}
	})
}

func TestServerMySQLImport(t *testing.T) {
	mockScript := writeMockScript(t, `
for arg in "$@"; do
  if [ "$arg" = 'SHOW DATABASES' ]; then
    echo "testdb"
    exit 0
  fi
done
cat > /dev/null
`)

	mysqlSvc := mysql.New(nil, config.Config{
		MySQLBin:      mockScript,
		MySQLRootUser: "root",
	})
	s := &Server{mysql: mysqlSvc}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/mysql/databases/{name}/import", s.handleMySQLImportDatabase)

	t.Run("raw stream import", func(t *testing.T) {
		body := strings.NewReader("INSERT INTO users VALUES (1);")
		req := httptest.NewRequest(http.MethodPost, "/v1/mysql/databases/testdb/import", body)
		req.Header.Set("Content-Type", "application/sql")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"imported":true`) {
			t.Errorf("body = %s, want imported:true", rec.Body.String())
		}
	})

	t.Run("multipart form import", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		part, err := mw.CreateFormFile("file", "dump.sql")
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		part.Write([]byte("INSERT INTO users VALUES (2);"))
		mw.Close()

		req := httptest.NewRequest(http.MethodPost, "/v1/mysql/databases/testdb/import", &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"imported":true`) {
			t.Errorf("body = %s, want imported:true", rec.Body.String())
		}
	})
}
