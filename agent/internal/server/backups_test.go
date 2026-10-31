package server

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/backup"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func TestServerUploadBackup(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "state"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	auditLog, err := audit.Open(filepath.Join(dir, "state"))
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		BackupDir: filepath.Join(dir, "backups"),
		StateDir:  filepath.Join(dir, "state"),
	}
	eng := tasks.New(st, context.Background())
	bSvc := backup.New(cfg, eng, nil, auditLog)
	s := &Server{
		cfg:     cfg,
		backups: bSvc,
		audit:   auditLog,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/backups/upload", s.handleUploadBackup)

	// Prepare multipart body
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "site-mysite.com-1700000000.zip")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	part.Write([]byte("fake zip archive content"))
	writer.Close()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/backups/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body: %s", rec.Code, rec.Body.String())
	}

	var res struct {
		Uploaded bool           `json:"uploaded"`
		Archive  backup.Archive `json:"archive"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if !res.Uploaded {
		t.Fatalf("uploaded = false, want true")
	}
	if res.Archive.ID != "site-mysite.com-1700000000.zip" {
		t.Errorf("archive.id = %q, want site-mysite.com-1700000000.zip", res.Archive.ID)
	}
	if res.Archive.Kind != "site" || res.Archive.Source != "mysite.com" {
		t.Errorf("archive = %+v", res.Archive)
	}
}
