package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/backup"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
	"clouddeck/agent/internal/wordpress"
)

func newTestWave2Server(t *testing.T) (*Server, http.Handler, string) {
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
		LogDir:        filepath.Join(dir, "logs"),
		DryRun:        true,
		AuthToken:     "test-token",
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	backupSvc := backup.New(cfg, eng, siteSvc, auditLog)
	wpSvc := wordpress.New(cfg, siteSvc, nil, auditLog, eng)

	siteRoot := filepath.Join(dir, "www", "wpwave2.test")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("mkdir site root: %v", err)
	}

	if err := st.CreateSite(store.Site{
		Domain:     "wpwave2.test",
		Root:       siteRoot,
		PHPVersion: "8.3",
		Status:     store.SiteActive,
		CreatedAt:  store.Now(),
		UpdatedAt:  store.Now(),
	}); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}

	s := &Server{
		cfg:       cfg,
		sites:     siteSvc,
		backups:   backupSvc,
		wordpress: wpSvc,
		audit:     auditLog,
	}

	mux := http.NewServeMux()
	// WordPress
	mux.HandleFunc("GET /v1/sites/{domain}/wordpress/status", s.handleGetWordPressStatus)
	mux.HandleFunc("GET /api/sites/{domain}/wordpress/status", s.handleGetWordPressStatus)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/install", s.handleInstallWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/install", s.handleInstallWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/stage", s.handleStageWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/stage", s.handleStageWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/login", s.handleLoginWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/login", s.handleLoginWordPress)
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/update", s.handleUpdateWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/update", s.handleUpdateWordPress)

	// Backup Destinations
	mux.HandleFunc("GET /v1/backups/destinations", s.handleListBackupDestinations)
	mux.HandleFunc("GET /api/backups/destinations", s.handleListBackupDestinations)
	mux.HandleFunc("POST /v1/backups/destinations", s.handleSaveBackupDestination)
	mux.HandleFunc("POST /api/backups/destinations", s.handleSaveBackupDestination)
	mux.HandleFunc("DELETE /v1/backups/destinations/{id}", s.handleDeleteBackupDestination)
	mux.HandleFunc("DELETE /api/backups/destinations/{id}", s.handleDeleteBackupDestination)
	mux.HandleFunc("POST /v1/backups/destinations/test", s.handleTestBackupDestination)
	mux.HandleFunc("POST /api/backups/destinations/test", s.handleTestBackupDestination)

	return s, s.authenticated(mux), dir
}

func TestWave2WordPressEndpoints(t *testing.T) {
	_, handler, _ := newTestWave2Server(t)

	// 1. GET initial status
	t.Run("GetStatusInitial", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/sites/wpwave2.test/wordpress/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var st wordpress.WPStatus
		if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if st.Installed {
			t.Fatalf("expected initial Installed=false")
		}
	})

	// 2. POST install WordPress
	t.Run("InstallWordPress", func(t *testing.T) {
		body, _ := json.Marshal(wordpress.WPInstallRequest{
			SiteTitle:     "Wave 2 Production",
			AdminUser:     "admin",
			AdminPassword: "SuperSecurePassword123!",
			AdminEmail:    "admin@wpwave2.test",
			DBName:        "wp_prod",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wpwave2.test/wordpress/install", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res wordpress.WPInstallResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.AdminUser != "admin" {
			t.Fatalf("unexpected install result: %+v", res)
		}
	})

	// 3. GET status after install
	t.Run("GetStatusAfterInstall", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/sites/wpwave2.test/wordpress/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var st wordpress.WPStatus
		if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !st.Installed || st.DBName != "wp_prod" {
			t.Fatalf("unexpected installed status: %+v", st)
		}
	})

	// 4. POST clone to staging
	t.Run("StageWordPress", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wpwave2.test/wordpress/stage", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res wordpress.WPStageResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.StagingDomain != "staging.wpwave2.test" {
			t.Fatalf("unexpected stage result: %+v", res)
		}
	})

	// 5. POST magic login
	t.Run("LoginWordPress", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wpwave2.test/wordpress/login", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res wordpress.WPLoginResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.LoginURL == "" {
			t.Fatalf("unexpected login result: %+v", res)
		}
	})

	// 6. POST update
	t.Run("UpdateWordPress", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"target": "all"})
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wpwave2.test/wordpress/update", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res wordpress.WPUpdateResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success {
			t.Fatalf("expected update success")
		}
	})
}

func TestWave2BackupDestinationsEndpoints(t *testing.T) {
	_, handler, _ := newTestWave2Server(t)

	// 1. GET empty destinations
	t.Run("ListEmptyDestinations", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/backups/destinations", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 2. POST create S3 destination
	var createdID string
	t.Run("CreateDestination", func(t *testing.T) {
		body, _ := json.Marshal(backup.Destination{
			Name:      "AWS S3 US-East",
			Provider:  "s3",
			Bucket:    "my-corp-backups",
			Region:    "us-east-1",
			AccessKey: "test_access_key",
			SecretKey: "test_secret_key_long_value_1234",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/backups/destinations", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Success     bool               `json:"success"`
			Destination backup.Destination `json:"destination"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.Destination.ID == "" {
			t.Fatalf("unexpected create destination response: %+v", res)
		}
		createdID = res.Destination.ID
	})

	// 3. POST test destination
	t.Run("TestDestination", func(t *testing.T) {
		body, _ := json.Marshal(backup.Destination{
			ID:        createdID,
			AccessKey: "test_key",
			SecretKey: "test_secret",
			Bucket:    "my-corp-backups",
			Provider:  "s3",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/backups/destinations/test", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res backup.TestResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success {
			t.Fatalf("expected test success, got %v: %s", res.Success, res.Message)
		}
	})

	// 4. DELETE destination
	t.Run("DeleteDestination", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/v1/backups/destinations/"+createdID, nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}
