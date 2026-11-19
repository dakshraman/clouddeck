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
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/doctor"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestDoctorServer(t *testing.T) (*Server, http.Handler, string) {
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
	doctorSvc := doctor.New(cfg, auditLog)

	siteRoot := filepath.Join(dir, "www", "example.com")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("mkdir site root: %v", err)
	}

	if err := st.CreateSite(store.Site{
		Domain:     "example.com",
		Root:       siteRoot,
		PHPVersion: "8.2",
		Status:     store.SiteActive,
		CreatedAt:  store.Now(),
		UpdatedAt:  store.Now(),
	}); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}

	s := &Server{
		cfg:    cfg,
		sites:  siteSvc,
		doctor: doctorSvc,
		audit:  auditLog,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/sites/{domain}/doctor", s.handleDiagnoseSite)
	mux.HandleFunc("POST /api/sites/{domain}/doctor", s.handleDiagnoseSite)
	mux.HandleFunc("POST /v1/sites/{domain}/doctor/fix", s.handleFixSiteIssue)
	mux.HandleFunc("POST /api/sites/{domain}/doctor/fix", s.handleFixSiteIssue)
	mux.HandleFunc("POST /v1/system/doctor", s.handleDiagnoseServer)
	mux.HandleFunc("POST /api/system/doctor", s.handleDiagnoseServer)
	mux.HandleFunc("POST /v1/system/doctor/fix", s.handleFixServerIssue)
	mux.HandleFunc("POST /api/system/doctor/fix", s.handleFixServerIssue)

	return s, s.authenticated(mux), dir
}

func TestDoctorServerEndpoints(t *testing.T) {
	_, handler, _ := newTestDoctorServer(t)

	// 1. POST /v1/system/doctor
	t.Run("DiagnoseServer", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/system/doctor", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var diag doctor.ServerDiagnosis
		if err := json.Unmarshal(rec.Body.Bytes(), &diag); err != nil {
			t.Fatalf("unmarshal ServerDiagnosis: %v", err)
		}
		if diag.HealthScore < 0 || diag.HealthScore > 100 {
			t.Fatalf("unexpected health score: %d", diag.HealthScore)
		}
	})

	// 2. POST /v1/system/doctor/fix
	t.Run("FixServerIssue", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"fixType": "clean_apt_cache"})
		req := httptest.NewRequest(http.MethodPost, "/v1/system/doctor/fix", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp["success"] != true {
			t.Fatalf("expected success true, got %v", resp["success"])
		}
	})

	// 3. POST /v1/system/doctor/fix with missing fixType
	t.Run("FixServerIssue_MissingFixType", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{})
		req := httptest.NewRequest(http.MethodPost, "/v1/system/doctor/fix", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 4. POST /v1/sites/{domain}/doctor
	t.Run("DiagnoseSite_Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/example.com/doctor", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var diag doctor.SiteDiagnosis
		if err := json.Unmarshal(rec.Body.Bytes(), &diag); err != nil {
			t.Fatalf("unmarshal SiteDiagnosis: %v", err)
		}
		if diag.Domain != "example.com" {
			t.Fatalf("expected domain example.com, got %s", diag.Domain)
		}
	})

	// 5. POST /v1/sites/{domain}/doctor on nonexistent site
	t.Run("DiagnoseSite_NotFound", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/nonexistent.com/doctor", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 6. POST /v1/sites/{domain}/doctor/fix
	t.Run("FixSiteIssue_Success", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"fixType": "fix_permissions"})
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/example.com/doctor/fix", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if resp["success"] != true {
			t.Fatalf("expected success true, got %v", resp["success"])
		}
	})

	// 7. POST /api/ alias routes
	t.Run("ApiAliasRoutes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/sites/example.com/doctor", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 on /api alias, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}
