package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestAgentsServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	cfg := config.Config{DryRun: true, AllowInsecureDev: true}
	eng := tasks.New(st, context.Background())
	s := &Server{
		cfg:    cfg,
		eng:    eng,
		agents: agents.New(cfg, nil),
	}
	t.Cleanup(func() {
		eng.Wait()
	})
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/agents", s.handleListAgents)
	mux.HandleFunc("GET /api/agents", s.handleListAgents)
	mux.HandleFunc("POST /v1/agents/install", s.handleAgentInstall)
	mux.HandleFunc("POST /api/agents/install", s.handleAgentInstall)
	mux.HandleFunc("POST /v1/agents/uninstall", s.handleAgentUninstall)
	mux.HandleFunc("POST /api/agents/uninstall", s.handleAgentUninstall)
	mux.HandleFunc("DELETE /v1/agents/{id}", s.handleAgentUninstall)
	mux.HandleFunc("DELETE /api/agents/{id}", s.handleAgentUninstall)

	return s, mux
}

func TestHandleListAgents(t *testing.T) {
	_, handler := newTestAgentsServer(t)

	for _, path := range []string{"/v1/agents", "/api/agents"} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want %d", path, rec.Code, http.StatusOK)
		}

		var resp struct {
			Agents []agents.Agent `json:"agents"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("%s decode json: %v", path, err)
		}

		if len(resp.Agents) != len(agents.Specs) {
			t.Fatalf("%s got %d agents, want %d", path, len(resp.Agents), len(agents.Specs))
		}
	}
}

func TestHandleAgentInstall(t *testing.T) {
	_, handler := newTestAgentsServer(t)

	t.Run("successful install dry-run", func(t *testing.T) {
		body := bytes.NewBufferString(`{"agent":"claude-code"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/install", body)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusAccepted {
			t.Fatalf("status = %d, want %d. Body: %s", rec.Code, http.StatusAccepted, rec.Body.String())
		}

		var resp struct {
			Success bool       `json:"success"`
			Agent   string     `json:"agent"`
			Task    store.Task `json:"task"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode json: %v", err)
		}
		if !resp.Success || resp.Agent != "claude-code" || resp.Task.ID == "" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("missing agent field", func(t *testing.T) {
		body := bytes.NewBufferString(`{}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/install", body)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
		}
	})

	t.Run("unknown agent", func(t *testing.T) {
		body := bytes.NewBufferString(`{"agent":"unknown-bot"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/install", body)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
		}
	})
}

func TestHandleAgentUninstall(t *testing.T) {
	_, handler := newTestAgentsServer(t)

	t.Run("uninstall via POST body", func(t *testing.T) {
		body := bytes.NewBufferString(`{"agent":"codex"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/uninstall", body)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusAccepted {
			t.Fatalf("status = %d, want %d. Body: %s", rec.Code, http.StatusAccepted, rec.Body.String())
		}
	})

	t.Run("uninstall via DELETE route", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodDelete, "/v1/agents/antigravity", nil)
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusAccepted {
			t.Fatalf("status = %d, want %d. Body: %s", rec.Code, http.StatusAccepted, rec.Body.String())
		}
	})
}
