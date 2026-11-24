package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/backup"
)

// handleGetS3DatabaseBackupConfig returns S3 database backup settings and schedule.
func (s *Server) handleGetS3DatabaseBackupConfig(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	conf, err := s.backups.GetS3DatabaseBackupConfig()
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, conf)
}

// handleSaveS3DatabaseBackupConfig saves S3 database backup credentials and schedule.
func (s *Server) handleSaveS3DatabaseBackupConfig(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	var req backup.S3DatabaseBackupConfig
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	conf, err := s.backups.SaveS3DatabaseBackupConfig(req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"config":  conf,
		"message": "S3 database backup schedule saved successfully.",
	})
}

// handleRunS3DatabaseBackup triggers an immediate database dump and S3 upload.
func (s *Server) handleRunS3DatabaseBackup(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	var req struct {
		Database string `json:"database"`
	}
	_ = decodeBody(w, r, &req)

	res, err := s.backups.RunS3DatabaseBackupNow(r.Context(), req.Database)
	if err != nil {
		writeError(w, apierr.Internal("failed to backup database to S3: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleTestS3DatabaseBackup tests S3 credentials and bucket write connectivity.
func (s *Server) handleTestS3DatabaseBackup(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	var req backup.S3DatabaseBackupConfig
	_ = decodeBody(w, r, &req)

	res, err := s.backups.TestS3DatabaseBackup(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}
