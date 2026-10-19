package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
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

type bareWriter struct{ header http.Header }

func (w bareWriter) Header() http.Header         { return w.header }
func (w bareWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w bareWriter) WriteHeader(int)             {}
