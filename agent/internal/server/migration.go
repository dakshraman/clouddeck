package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/migration"
)

// handleUploadMigration accepts an uploaded cpmove-*.tar.gz file and stores it in migration storage.
func (s *Server) handleUploadMigration(w http.ResponseWriter, r *http.Request) {
	if s.migration == nil {
		writeError(w, apierr.Internal("migration service is not initialized"))
		return
	}

	// Support multipart upload or raw body
	var filename string
	var reader = r.Body

	mr, err := r.MultipartReader()
	if err == nil {
		part, err := mr.NextPart()
		if err == nil {
			filename = part.FileName()
			reader = part
		}
	}
	if filename == "" {
		filename = r.URL.Query().Get("filename")
	}

	savedPath, err := s.migration.UploadArchive(reader, filename)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"archivePath": savedPath,
	})
}

// handleImportMigration restores websites, databases, and mailboxes from a cPanel archive.
func (s *Server) handleImportMigration(w http.ResponseWriter, r *http.Request) {
	if s.migration == nil {
		writeError(w, apierr.Internal("migration service is not initialized"))
		return
	}

	var req migration.ImportRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	res, err := s.migration.ImportCPanel(r.Context(), req.ArchivePath, req.Overwrite)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleListMigrationHistory returns all past cPanel migrations.
func (s *Server) handleListMigrationHistory(w http.ResponseWriter, r *http.Request) {
	if s.migration == nil {
		writeError(w, apierr.Internal("migration service is not initialized"))
		return
	}

	history, err := s.migration.History()
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"migrations": history,
	})
}
