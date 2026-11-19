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

func TestHandleAgentChat(t *testing.T) {
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

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/agents/chat", s.handleAgentChat)
	mux.HandleFunc("POST /api/agents/chat", s.handleAgentChat)

	t.Run("successful heuristic chat reply", func(t *testing.T) {
		body := bytes.NewBufferString(`{"prompt":"Why is my site showing 502 Bad Gateway?"}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/chat", body)
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d. Body: %s", rec.Code, http.StatusOK, rec.Body.String())
		}

		var resp agents.ChatResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode json: %v", err)
		}
		if resp.Reply == "" || resp.Model == "" {
			t.Fatalf("unexpected chat response: %+v", resp)
		}
	})

	t.Run("missing prompt", func(t *testing.T) {
		body := bytes.NewBufferString(`{"prompt":""}`)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/v1/agents/chat", body)
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
		}
	})
}
