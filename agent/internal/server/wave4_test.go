package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/postgres"
	"clouddeck/agent/internal/rbac"
	"clouddeck/agent/internal/security"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestWave4Server(t *testing.T) (*Server, http.Handler, string) {
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
		StateDir:  dir,
		Webroot:   filepath.Join(dir, "www"),
		LogDir:    filepath.Join(dir, "logs"),
		DryRun:    true,
		AuthToken: "test-token",
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	rbacSvc := rbac.New(cfg, auditLog)
	pgSvc := postgres.New(cfg, auditLog)
	secSvc := security.New(cfg)

	s := &Server{
		cfg:      cfg,
		rbac:     rbacSvc,
		postgres: pgSvc,
		security: secSvc,
		audit:    auditLog,
	}

	mux := http.NewServeMux()
	// Users / RBAC
	mux.HandleFunc("GET /v1/users", s.handleListUsers)
	mux.HandleFunc("GET /api/users", s.handleListUsers)
	mux.HandleFunc("POST /v1/users", s.handleCreateUser)
	mux.HandleFunc("POST /api/users", s.handleCreateUser)
	mux.HandleFunc("PUT /v1/users/{username}", s.handleUpdateUser)
	mux.HandleFunc("PUT /api/users/{username}", s.handleUpdateUser)
	mux.HandleFunc("DELETE /v1/users/{username}", s.handleDeleteUser)
	mux.HandleFunc("DELETE /api/users/{username}", s.handleDeleteUser)

	// PostgreSQL
	mux.HandleFunc("GET /v1/postgres/status", s.handlePostgresStatus)
	mux.HandleFunc("GET /api/postgres/status", s.handlePostgresStatus)
	mux.HandleFunc("GET /v1/postgres/databases", s.handlePostgresListDatabases)
	mux.HandleFunc("GET /api/postgres/databases", s.handlePostgresListDatabases)
	mux.HandleFunc("POST /v1/postgres/databases", s.handlePostgresCreateDatabase)
	mux.HandleFunc("POST /api/postgres/databases", s.handlePostgresCreateDatabase)
	mux.HandleFunc("DELETE /v1/postgres/databases/{name}", s.handlePostgresDeleteDatabase)
	mux.HandleFunc("DELETE /api/postgres/databases/{name}", s.handlePostgresDeleteDatabase)
	mux.HandleFunc("GET /v1/postgres/users", s.handlePostgresListUsers)
	mux.HandleFunc("GET /api/postgres/users", s.handlePostgresListUsers)
	mux.HandleFunc("POST /v1/postgres/users", s.handlePostgresCreateUser)
	mux.HandleFunc("POST /api/postgres/users", s.handlePostgresCreateUser)
	mux.HandleFunc("DELETE /v1/postgres/users/{name}", s.handlePostgresDeleteUser)
	mux.HandleFunc("DELETE /api/postgres/users/{name}", s.handlePostgresDeleteUser)

	// Security Posture
	mux.HandleFunc("GET /v1/security/posture", s.handleGetSecurityPosture)
	mux.HandleFunc("GET /api/security/posture", s.handleGetSecurityPosture)
	mux.HandleFunc("POST /v1/security/scan", s.handleScanSecurityPosture)
	mux.HandleFunc("POST /api/security/scan", s.handleScanSecurityPosture)
	mux.HandleFunc("POST /v1/security/harden", s.handleHardenSecurity)
	mux.HandleFunc("POST /api/security/harden", s.handleHardenSecurity)

	return s, s.authenticated(mux), dir
}

func TestWave4UsersEndpoints(t *testing.T) {
	_, handler, _ := newTestWave4Server(t)

	// 1. GET initial empty users
	t.Run("GetEmptyUsers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/users", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 2. POST create user
	t.Run("CreateUser", func(t *testing.T) {
		body, _ := json.Marshal(rbac.User{
			Username: "agency_client",
			Email:    "client@agency.test",
			Role:     "client",
			Domains:  []string{"clientdomain.com"},
			Quotas: rbac.Quotas{
				DiskMB:       4096,
				MaxDatabases: 2,
				MaxMailboxes: 5,
			},
			Password: "InitialPassword123!",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/users", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Success bool      `json:"success"`
			User    rbac.User `json:"user"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.User.Username != "agency_client" {
			t.Fatalf("unexpected user response: %+v", res)
		}
	})

	// 3. PUT update user
	t.Run("UpdateUser", func(t *testing.T) {
		body, _ := json.Marshal(rbac.User{
			Email:   "client-new@agency.test",
			Domains: []string{"clientdomain.com", "clientblog.com"},
		})
		req := httptest.NewRequest(http.MethodPut, "/api/users/agency_client", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 4. DELETE user
	t.Run("DeleteUser", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/v1/users/agency_client", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestWave4PostgresEndpoints(t *testing.T) {
	_, handler, _ := newTestWave4Server(t)

	// 1. GET status
	t.Run("GetPostgresStatus", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/postgres/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 2. POST create database
	t.Run("CreatePostgresDatabase", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"name":  "pg_wave4_db",
			"owner": "postgres",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/postgres/databases", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 3. GET list databases
	t.Run("ListPostgresDatabases", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/postgres/databases", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res struct {
			Databases []postgres.Database `json:"databases"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(res.Databases) < 2 {
			t.Fatalf("expected at least 2 databases (postgres + pg_wave4_db)")
		}
	})

	// 4. POST create user
	t.Run("CreatePostgresUser", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"username":  "pg_wave4_user",
			"password":  "SecretPass999",
			"superuser": false,
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/postgres/users", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 5. DELETE database
	t.Run("DeletePostgresDatabase", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/v1/postgres/databases/pg_wave4_db", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 6. DELETE user
	t.Run("DeletePostgresUser", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/v1/postgres/users/pg_wave4_user", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestWave4SecurityPostureEndpoints(t *testing.T) {
	_, handler, _ := newTestWave4Server(t)

	// 1. GET security posture
	t.Run("GetSecurityPosture", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/security/posture", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var report security.PostureReport
		if err := json.Unmarshal(rec.Body.Bytes(), &report); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if report.Score < 0 || report.Score > 100 {
			t.Fatalf("expected score 0-100, got %d", report.Score)
		}
	})

	// 2. POST security scan
	t.Run("ScanSecurityPosture", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/security/scan", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 3. POST auto-harden
	t.Run("HardenSecurity", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/security/harden", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res security.HardenResult
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !res.Success || res.NewScore < 90 {
			t.Fatalf("expected auto-hardening success with >=90 score, got %+v", res)
		}
	})
}
