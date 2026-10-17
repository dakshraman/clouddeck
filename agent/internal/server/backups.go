package server

import (
	"fmt"
	"io"
	stdlog "log"
	"net/http"
	"os"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/backup"
)

func (s *Server) handleListBackups(w http.ResponseWriter, r *http.Request) {
	archives, err := s.backups.List()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"backups": archives})
}

func (s *Server) handleCreateBackup(w http.ResponseWriter, r *http.Request) {
	var req backup.CreateRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.backups.Create(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleGetBackup(w http.ResponseWriter, r *http.Request) {
	archive, err := s.backups.Get(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, archive)
}

func (s *Server) handleDownloadBackup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	path, err := s.backups.Path(id)
	if err != nil {
		writeError(w, err)
		return
	}
	file, err := os.Open(path)
	if err != nil {
		writeError(w, apierr.Internal("open backup archive: "+err.Error()))
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		writeError(w, apierr.Internal("stat backup archive: "+err.Error()))
		return
	}
	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", id))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	if _, err := io.Copy(w, file); err != nil {
		stdlog.Printf("server: stream backup %s: %v", id, err)
	}
}

func (s *Server) handleRestoreBackup(w http.ResponseWriter, r *http.Request) {
	task, err := s.backups.Restore(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleDeleteBackup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.backups.Delete(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "deleted": true})
}
