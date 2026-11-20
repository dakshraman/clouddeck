package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/config"
)

func TestVaultEndpoints(t *testing.T) {
	cfg := config.Config{StateDir: t.TempDir(), DryRun: true, AllowInsecureDev: true}
	s := &Server{
		cfg:    cfg,
		agents: agents.New(cfg, nil),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/agents/keys", s.handleGetAgentKeys)
	mux.HandleFunc("POST /v1/agents/keys", s.handleSetAgentKeys)

	// 1. GET /v1/agents/keys
	req := httptest.NewRequest("GET", "/v1/agents/keys", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/agents/keys returned %d: %s", rec.Code, rec.Body.String())
	}

	var getResp struct {
		Keys []struct {
			Name  string `json:"name"`
			IsSet bool   `json:"isSet"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("unmarshal keys: %v", err)
	}
	if len(getResp.Keys) == 0 {
		t.Fatalf("expected keys list to not be empty")
	}

	// 2. POST /v1/agents/keys
	body, _ := json.Marshal(map[string]any{
		"keys": map[string]string{
			"ANTHROPIC_API_KEY": "sk-ant-test-12345678",
			"OLLAMA_HOST":       "http://127.0.0.1:11434",
		},
	})
	postReq := httptest.NewRequest("POST", "/v1/agents/keys", bytes.NewReader(body))
	postReq.Header.Set("Content-Type", "application/json")
	postRec := httptest.NewRecorder()
	mux.ServeHTTP(postRec, postReq)

	if postRec.Code != http.StatusOK {
		t.Fatalf("POST /v1/agents/keys returned %d: %s", postRec.Code, postRec.Body.String())
	}
}
