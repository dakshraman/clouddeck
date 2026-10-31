package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
	"clouddeck/agent/internal/term"
)

func TestHandleTermStart(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("term tests require linux")
	}
	auditLog, err := audit.Open(t.TempDir())
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cur, err := user.Current()
	if err != nil {
		t.Skipf("current user unavailable: %v", err)
	}

	stateDir := t.TempDir()
	st, err := store.Open(filepath.Join(stateDir, "state"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	eng := tasks.New(st, context.Background())
	siteDir := filepath.Join(t.TempDir(), "site-example")
	if err := os.MkdirAll(siteDir, 0o755); err != nil {
		t.Fatalf("mkdir siteDir: %v", err)
	}

	cfg := config.Config{
		DryRun:    false,
		TermUser:  cur.Username,
		TermShell: "/bin/sh",
	}
	siteSvc := sites.New(st, eng, auditLog, cfg)
	if err := st.CreateSite(store.Site{
		Domain: "example.com",
		Root:   siteDir,
		Status: store.SiteActive,
	}); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}

	termSvc := term.New(cfg, auditLog)
	s := &Server{sites: siteSvc, term: termSvc}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/term/sessions", s.handleTermStart)

	t.Run("default start", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/term/sessions", strings.NewReader(`{"cols":80,"rows":24}`))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusCreated, rec.Body.String())
		}
		var sess term.Session
		if err := json.NewDecoder(rec.Body).Decode(&sess); err != nil {
			t.Fatalf("decode session: %v", err)
		}
		defer termSvc.Close(sess.ID)
		if sess.ID == "" {
			t.Error("session id is empty")
		}
	})

	t.Run("start with explicit dir", func(t *testing.T) {
		customDir := t.TempDir()
		body := fmt.Sprintf(`{"cols":80,"rows":24,"dir":%q}`, customDir)
		req := httptest.NewRequest(http.MethodPost, "/v1/term/sessions", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusCreated, rec.Body.String())
		}
		var sess term.Session
		if err := json.NewDecoder(rec.Body).Decode(&sess); err != nil {
			t.Fatalf("decode session: %v", err)
		}
		defer termSvc.Close(sess.ID)
		if sess.ID == "" {
			t.Error("session id is empty")
		}
	})

	t.Run("start with domain resolves site root", func(t *testing.T) {
		body := `{"cols":80,"rows":24,"domain":"example.com"}`
		req := httptest.NewRequest(http.MethodPost, "/v1/term/sessions", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusCreated, rec.Body.String())
		}
		var sess term.Session
		if err := json.NewDecoder(rec.Body).Decode(&sess); err != nil {
			t.Fatalf("decode session: %v", err)
		}
		defer termSvc.Close(sess.ID)
		if sess.ID == "" {
			t.Error("session id is empty")
		}
	})

	t.Run("start with nonexistent domain fails", func(t *testing.T) {
		body := `{"cols":80,"rows":24,"domain":"nosuchsite.org"}`
		req := httptest.NewRequest(http.MethodPost, "/v1/term/sessions", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404: %s", rec.Code, rec.Body.String())
		}
	})
}
