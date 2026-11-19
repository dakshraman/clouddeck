package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/cron"
)

func newTestCronServer(t *testing.T) (*Server, http.Handler, string) {
	t.Helper()
	dir := t.TempDir()

	cfg := config.Config{
		StateDir:  filepath.Join(dir, "state"),
		CronDir:   filepath.Join(dir, "cron.d"),
		AuthToken: "test-token",
	}
	_ = os.MkdirAll(cfg.StateDir, 0o755)
	_ = os.MkdirAll(cfg.CronDir, 0o755)

	auditLog, _ := audit.Open(cfg.StateDir)
	cronSvc := cron.New(cfg, auditLog)

	s := &Server{
		cfg:   cfg,
		cron:  cronSvc,
		audit: auditLog,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/cron", s.handleListCronJobs)
	mux.HandleFunc("POST /v1/cron", s.handleCreateCronJob)
	mux.HandleFunc("GET /v1/cron/presets", s.handleCronPresets)
	mux.HandleFunc("GET /v1/cron/history", s.handleCronHistory)
	mux.HandleFunc("GET /v1/cron/{id}", s.handleGetCronJob)
	mux.HandleFunc("PUT /v1/cron/{id}", s.handleUpdateCronJob)
	mux.HandleFunc("DELETE /v1/cron/{id}", s.handleDeleteCronJob)
	mux.HandleFunc("POST /v1/cron/{id}/run", s.handleRunCronJob)

	return s, s.authenticated(mux), dir
}

func TestServerCronEndpoints(t *testing.T) {
	_, handler, _ := newTestCronServer(t)

	// 1. Presets endpoint
	req := httptest.NewRequest(http.MethodGet, "/v1/cron/presets", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("presets returned status %d", rec.Code)
	}

	// 2. Create job
	body := map[string]any{
		"schedule": "*/5 * * * *",
		"command":  "echo 'api test'",
		"title":    "API Test Job",
		"user":     "root",
	}
	bodyBytes, _ := json.Marshal(body)
	req = httptest.NewRequest(http.MethodPost, "/v1/cron", bytes.NewReader(bodyBytes))
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("create returned status %d: %s", rec.Code, rec.Body.String())
	}

	var created struct {
		Job cron.Job `json:"job"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("unmarshal created: %v", err)
	}
	if created.Job.ID == "" {
		t.Fatalf("expected non-empty job ID")
	}
	jobID := created.Job.ID

	// 3. List jobs
	req = httptest.NewRequest(http.MethodGet, "/v1/cron", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("list returned status %d", rec.Code)
	}
	var listed struct {
		Jobs []cron.Job `json:"jobs"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if len(listed.Jobs) != 1 || listed.Jobs[0].ID != jobID {
		t.Fatalf("unexpected jobs in list: %+v", listed.Jobs)
	}

	// 4. Update / toggle job
	disabled := false
	upBody := map[string]any{"enabled": disabled}
	upBytes, _ := json.Marshal(upBody)
	req = httptest.NewRequest(http.MethodPut, "/v1/cron/"+jobID, bytes.NewReader(upBytes))
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("update returned status %d: %s", rec.Code, rec.Body.String())
	}

	// 5. Run job
	req = httptest.NewRequest(http.MethodPost, "/v1/cron/"+jobID+"/run", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("run returned status %d: %s", rec.Code, rec.Body.String())
	}
	var runResult cron.RunResult
	if err := json.Unmarshal(rec.Body.Bytes(), &runResult); err != nil {
		t.Fatalf("unmarshal run result: %v", err)
	}
	if !runResult.Success || runResult.ExitCode != 0 {
		t.Fatalf("run failed: %+v", runResult)
	}

	// 6. History
	req = httptest.NewRequest(http.MethodGet, "/v1/cron/history", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("history returned status %d", rec.Code)
	}
	var hist struct {
		History []cron.ExecutionRecord `json:"history"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &hist); err != nil {
		t.Fatalf("unmarshal history: %v", err)
	}
	if len(hist.History) != 1 {
		t.Fatalf("expected 1 history record, got %d", len(hist.History))
	}

	// 7. Delete job
	req = httptest.NewRequest(http.MethodDelete, "/v1/cron/"+jobID, nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("delete returned status %d", rec.Code)
	}

	// 8. Verify not found after delete
	req = httptest.NewRequest(http.MethodGet, "/v1/cron/"+jobID, nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
