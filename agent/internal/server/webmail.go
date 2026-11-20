package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// handleGetWebmailStatus returns webmail client installation status.
func (s *Server) handleGetWebmailStatus(w http.ResponseWriter, r *http.Request) {
	if s.mail == nil {
		writeError(w, apierr.Internal("mail service is not initialized"))
		return
	}

	status := s.mail.WebmailStatus()
	writeJSON(w, http.StatusOK, status)
}

// handleInstallWebmail installs or provisions the integrated webmail interface.
func (s *Server) handleInstallWebmail(w http.ResponseWriter, r *http.Request) {
	if s.mail == nil {
		writeError(w, apierr.Internal("mail service is not initialized"))
		return
	}

	if err := s.mail.InstallWebmail(r.Context()); err != nil {
		writeError(w, apierr.Internal("failed to install webmail: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Webmail client ready",
		"status":  s.mail.WebmailStatus(),
	})
}

// handleWebmailSSO creates a secure single-sign-on access token for a mailbox.
func (s *Server) handleWebmailSSO(w http.ResponseWriter, r *http.Request) {
	if s.mail == nil {
		writeError(w, apierr.Internal("mail service is not initialized"))
		return
	}

	var req struct {
		Email string `json:"email"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	email := strings.TrimSpace(req.Email)
	if email == "" {
		writeError(w, apierr.BadRequest("missing_email", "email is required"))
		return
	}

	sso, err := s.mail.GenerateWebmailSSO(r.Context(), email)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, sso)
}
