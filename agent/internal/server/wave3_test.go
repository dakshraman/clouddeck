package server

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/migration"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestWave3Server(t *testing.T) (*Server, http.Handler, string) {
	t.Helper()
	dir := t.TempDir()

	st, err := store.Open(filepath.Join(dir, "store.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}

	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		StateDir:      dir,
		NginxSitesDir: filepath.Join(dir, "nginx"),
		Webroot:       filepath.Join(dir, "www"),
		MailRoot:      filepath.Join(dir, "mail"),
		LogDir:        filepath.Join(dir, "logs"),
		MailHostname:  "mail.wave3.test",
		DryRun:        true,
		AuthToken:     "test-token",
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	mailSvc := mail.New(cfg, auditLog, nil)
	migSvc := migration.New(cfg, siteSvc, nil, mailSvc, auditLog, eng)

	s := &Server{
		cfg:       cfg,
		sites:     siteSvc,
		mail:      mailSvc,
		migration: migSvc,
		audit:     auditLog,
	}

	mux := http.NewServeMux()
	// Migration
	mux.HandleFunc("POST /v1/migrations/cpanel/upload", s.handleUploadMigration)
	mux.HandleFunc("POST /api/migrations/cpanel/upload", s.handleUploadMigration)
	mux.HandleFunc("POST /v1/migrations/cpanel/import", s.handleImportMigration)
	mux.HandleFunc("POST /api/migrations/cpanel/import", s.handleImportMigration)
	mux.HandleFunc("GET /v1/migrations/history", s.handleListMigrationHistory)
	mux.HandleFunc("GET /api/migrations/history", s.handleListMigrationHistory)

	// Webmail
	mux.HandleFunc("GET /v1/mail/webmail/status", s.handleGetWebmailStatus)
	mux.HandleFunc("GET /api/mail/webmail/status", s.handleGetWebmailStatus)
	mux.HandleFunc("POST /v1/mail/webmail/install", s.handleInstallWebmail)
	mux.HandleFunc("POST /api/mail/webmail/install", s.handleInstallWebmail)
	mux.HandleFunc("POST /v1/mail/webmail/sso", s.handleWebmailSSO)
	mux.HandleFunc("POST /api/mail/webmail/sso", s.handleWebmailSSO)

	// Anti-Spam
	mux.HandleFunc("GET /v1/mail/spam/status", s.handleGetSpamStatus)
	mux.HandleFunc("GET /api/mail/spam/status", s.handleGetSpamStatus)
	mux.HandleFunc("PUT /v1/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("PUT /api/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("POST /v1/mail/spam/config", s.handleUpdateSpamConfig)
	mux.HandleFunc("POST /api/mail/spam/config", s.handleUpdateSpamConfig)

	return s, s.authenticated(mux), dir
}

func createTestArchiveBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	gzw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gzw)

	files := map[string]string{
		"cpmove-wave3user/userdata/wave3site.com":               "documentroot: /home/wave3user/public_html\nphpversion: 8.3\n",
		"cpmove-wave3user/homedir/public_html/index.php":        "<?php echo 'wave3 restored'; ?>",
		"cpmove-wave3user/mysql/wave3user_db.sql":               "CREATE TABLE t (id INT);",
		"cpmove-wave3user/mail/wave3site.com/contact/cur/1.msg": "From: a@b.com\nSubject: Hi\n\nMsg",
	}

	for name, content := range files {
		_ = tw.WriteHeader(&tar.Header{
			Name:     name,
			Mode:     0o644,
			Size:     int64(len(content)),
			Typeflag: tar.TypeReg,
		})
		_, _ = tw.Write([]byte(content))
	}
	_ = tw.Close()
	_ = gzw.Close()
	return buf.Bytes()
}

func TestWave3MigrationEndpoints(t *testing.T) {
	_, handler, _ := newTestWave3Server(t)

	// 1. GET initial history
	t.Run("GetEmptyHistory", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/migrations/history", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 2. POST upload cpmove archive
	var uploadedPath string
	t.Run("UploadArchive", func(t *testing.T) {
		archiveBytes := createTestArchiveBytes(t)
		req := httptest.NewRequest(http.MethodPost, "/v1/migrations/cpanel/upload?filename=cpmove-wave3user.tar.gz", bytes.NewReader(archiveBytes))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Success     bool   `json:"success"`
			ArchivePath string `json:"archivePath"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.ArchivePath == "" {
			t.Fatalf("unexpected upload response: %+v", res)
		}
		uploadedPath = res.ArchivePath
	})

	// 3. POST import cpmove archive
	t.Run("ImportArchive", func(t *testing.T) {
		body, _ := json.Marshal(migration.ImportRequest{
			ArchivePath: uploadedPath,
			Overwrite:   true,
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/migrations/cpanel/import", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res migration.ImportResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.Migration.Username != "wave3user" {
			t.Fatalf("unexpected import result: %+v", res)
		}
	})

	// 4. GET history contains record
	t.Run("GetHistoryAfterImport", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/migrations/history", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Migrations []migration.MigrationRecord `json:"migrations"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(res.Migrations) != 1 {
			t.Fatalf("expected 1 migration in history, got %d", len(res.Migrations))
		}
	})
}

func TestWave3WebmailEndpoints(t *testing.T) {
	_, handler, _ := newTestWave3Server(t)

	// 1. GET webmail status
	t.Run("GetWebmailStatus", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mail/webmail/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var st mail.WebmailStatus
		if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !st.Installed {
			t.Fatalf("expected Installed=true")
		}
	})

	// 2. POST install webmail
	t.Run("InstallWebmail", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/mail/webmail/install", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 3. POST webmail SSO
	t.Run("WebmailSSO", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"email": "support@wave3.test"})
		req := httptest.NewRequest(http.MethodPost, "/v1/mail/webmail/sso", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res mail.WebmailSSOResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.Token == "" {
			t.Fatalf("unexpected SSO response: %+v", res)
		}
	})
}

func TestWave3SpamEndpoints(t *testing.T) {
	_, handler, _ := newTestWave3Server(t)

	// 1. GET spam status
	t.Run("GetSpamStatus", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/mail/spam/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var st mail.SpamStatus
		if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !st.Installed {
			t.Fatalf("expected Installed=true")
		}
	})

	// 2. PUT spam config
	t.Run("UpdateSpamConfig", func(t *testing.T) {
		body, _ := json.Marshal(mail.SpamConfig{
			Enabled:          true,
			RejectScore:      14.0,
			TagScore:         4.5,
			Greylisting:      true,
			WhitelistDomains: []string{"friends.org"},
		})
		req := httptest.NewRequest(http.MethodPut, "/v1/mail/spam/config", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Success bool            `json:"success"`
			Config  mail.SpamConfig `json:"config"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.Config.RejectScore != 14.0 {
			t.Fatalf("unexpected update spam response: %+v", res)
		}
	})
}
