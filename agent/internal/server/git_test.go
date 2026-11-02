package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/git"
	"clouddeck/agent/internal/store"
)

func TestServerGitEndpoints(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		StateDir:        dir,
		AllowInsecureDev: true,
	}

	site := store.Site{
		Domain: "gittest.com",
		Root:   filepath.Join(dir, "www", "gittest.com"),
	}
	if err := st.CreateSite(site); err != nil {
		t.Fatal(err)
	}

	gitSvc := git.New(st, cfg, auditLog)
	s := &Server{
		cfg:   cfg,
		git:   gitSvc,
		audit: auditLog,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/sites/{domain}/git", s.handleGetSiteGit)
	mux.HandleFunc("PUT /v1/sites/{domain}/git", s.handleSaveSiteGit)
	mux.HandleFunc("DELETE /v1/sites/{domain}/git", s.handleRemoveSiteGit)

	// GET git config (auto generates deploy key)
	req := httptest.NewRequest(http.MethodGet, "/v1/sites/gittest.com/git", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /git code = %d, body: %s", rec.Code, rec.Body.String())
	}

	var getRes store.GitConfig
	if err := json.NewDecoder(rec.Body).Decode(&getRes); err != nil {
		t.Fatal(err)
	}
	if getRes.DeployKeyPublic == "" {
		t.Errorf("expected deploy key in response")
	}

	// PUT git config
	saveBody, _ := json.Marshal(git.SaveInput{
		RepoURL:      "https://github.com/clouddeck/starter.git",
		Branch:       "main",
		BuildCommand: "npm run build",
		AutoDeploy:   true,
	})
	req = httptest.NewRequest(http.MethodPut, "/v1/sites/gittest.com/git", bytes.NewReader(saveBody))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT /git code = %d, body: %s", rec.Code, rec.Body.String())
	}

	var putRes store.GitConfig
	if err := json.NewDecoder(rec.Body).Decode(&putRes); err != nil {
		t.Fatal(err)
	}
	if putRes.RepoURL != "https://github.com/clouddeck/starter.git" {
		t.Errorf("expected RepoURL to match")
	}

	// DELETE git config
	req = httptest.NewRequest(http.MethodDelete, "/v1/sites/gittest.com/git", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE /git code = %d, body: %s", rec.Code, rec.Body.String())
	}
}
