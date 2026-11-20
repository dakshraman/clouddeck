package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/mail"
)

// handleGetSpamStatus returns current anti-spam engine and scoring thresholds.
func (s *Server) handleGetSpamStatus(w http.ResponseWriter, r *http.Request) {
	if s.mail == nil {
		writeError(w, apierr.Internal("mail service is not initialized"))
		return
	}

	status := s.mail.SpamStatus()
	writeJSON(w, http.StatusOK, status)
}

// handleUpdateSpamConfig updates anti-spam thresholds, greylisting, and whitelist/blacklist.
func (s *Server) handleUpdateSpamConfig(w http.ResponseWriter, r *http.Request) {
	if s.mail == nil {
		writeError(w, apierr.Internal("mail service is not initialized"))
		return
	}

	var req mail.SpamConfig
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	if err := s.mail.UpdateSpamConfig(r.Context(), req); err != nil {
		writeError(w, apierr.Internal("failed to update spam configuration: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"config":  s.mail.SpamStatus().Config,
	})
}
