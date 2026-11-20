package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/backup"
)

// handleListBackupDestinations returns all registered cloud storage destinations.
func (s *Server) handleListBackupDestinations(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	list, err := s.backups.ListDestinations()
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"destinations": list,
	})
}

// handleSaveBackupDestination creates or updates an S3-compatible cloud storage destination.
func (s *Server) handleSaveBackupDestination(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	var req backup.Destination
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	dest, err := s.backups.SaveDestination(req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"destination": dest,
	})
}

// handleDeleteBackupDestination removes a destination by ID.
func (s *Server) handleDeleteBackupDestination(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, apierr.BadRequest("missing_id", "destination id is required"))
		return
	}

	if err := s.backups.DeleteDestination(id); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"id":      id,
	})
}

// handleTestBackupDestination tests connectivity and credentials for an S3 destination.
func (s *Server) handleTestBackupDestination(w http.ResponseWriter, r *http.Request) {
	if s.backups == nil {
		writeError(w, apierr.Internal("backup service is not initialized"))
		return
	}

	var req backup.Destination
	_ = decodeBody(w, r, &req)

	result, err := s.backups.TestDestination(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}
