package server

import (
	"errors"
	"fmt"
	"io"
	stdlog "log"
	"net/http"
	"os"
	"strings"

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
	if strings.HasSuffix(id, ".zip") {
		w.Header().Set("Content-Type", "application/zip")
	} else {
		w.Header().Set("Content-Type", "application/gzip")
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", id))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	if _, err := io.Copy(w, file); err != nil {
		stdlog.Printf("server: stream backup %s: %v", id, err)
	}
}

func (s *Server) handleUploadBackup(w http.ResponseWriter, r *http.Request) {
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("invalid multipart body: %v", err)))
		return
	}
	var archive backup.Archive
	found := false
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("read multipart body: %v", err)))
			return
		}
		if part.FormName() != "file" {
			part.Close()
			continue
		}
		filename := part.FileName()
		if filename == "" {
			part.Close()
			writeError(w, apierr.BadRequest("invalid_request", "empty filename in multipart part"))
			return
		}
		arch, err := s.backups.SaveUploaded(filename, part)
		part.Close()
		if err != nil {
			writeError(w, err)
			return
		}
		archive = arch
		found = true
		break
	}
	if !found {
		writeError(w, apierr.BadRequest("invalid_request", "form field \"file\" is required"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"archive": archive, "uploaded": true})
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
