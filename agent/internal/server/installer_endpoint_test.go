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
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func TestServerInstallTemplate(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir)
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
	}
	eng := tasks.New(st, context.Background())
	siteSvc := sites.New(st, eng, auditLog, cfg)
	t.Cleanup(eng.Wait)

	siteRoot := filepath.Join(dir, "www", "testapp.com")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("mkdir site root: %v", err)
	}
	if err := st.CreateSite(store.Site{
		Domain:    "testapp.com",
		Root:      siteRoot,
		Status:    store.SiteActive,
		CreatedAt: store.Now(),
		UpdatedAt: store.Now(),
	}); err != nil {
		t.Fatalf("create site: %v", err)
	}

	s := &Server{sites: siteSvc}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/sites/{domain}/install-template", s.handleInstallTemplate)

	body, _ := json.Marshal(map[string]any{
		"template": "nextjs",
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/sites/testapp.com/install-template", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("POST /v1/sites/testapp.com/install-template code = %d, body: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if resp["status"] != "installed" || resp["template"] != "nextjs" || resp["domain"] != "testapp.com" {
		t.Fatalf("unexpected response body: %v", resp)
	}
}
