package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"clouddeck/agent/internal/config"
)

// The logging middleware wraps every response writer; SSE handlers assert
// http.Flusher, so the wrapper must forward Flush to the real writer.
func TestLogRequestsPreservesFlusher(t *testing.T) {
	h := logRequests(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, ok := w.(http.Flusher)
		if !ok {
			t.Error("statusWriter does not implement http.Flusher")
			return
		}
		f.Flush()
	}))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/term/sessions/x/stream", nil))
	if !rec.Flushed {
		t.Fatal("Flush did not reach the underlying writer")
	}
}

// A writer without Flush support must be tolerated (no panic).
func TestStatusWriterFlushWithoutSupport(t *testing.T) {
	sw := &statusWriter{ResponseWriter: bareWriter{header: http.Header{}}, status: http.StatusOK}
	sw.Flush()
}

func TestAuthenticationMiddleware(t *testing.T) {
	s := &Server{cfg: config.Config{AuthToken: "secret"}}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	h := s.authenticated(next)

	t.Run("health is public", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/health", nil))
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
	t.Run("missing token is rejected", func(t *testing.T) {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/system", nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})
	t.Run("valid token is accepted", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/v1/system", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "secret")
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
		}
	})
}

type bareWriter struct{ header http.Header }

func (w bareWriter) Header() http.Header         { return w.header }
func (w bareWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w bareWriter) WriteHeader(int)             {}
