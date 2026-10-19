// v0.6 security handlers: ModSecurity, fail2ban and the audit overview.
package server

import (
	"net/http"

	"clouddeck/agent/internal/security"
)

func (s *Server) handleSecurityStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.security.Status(r.Context()))
}

func (s *Server) handleSecurityUnban(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Jail string `json:"jail"`
		IP   string `json:"ip"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.security.Unban(r.Context(), req.Jail, req.IP); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleSecurityJail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.security.SetJailEnabled(r.Context(), r.PathValue("jail"), req.Enabled); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleModsecStatus reports the engine state that the Security page shows.
func (s *Server) handleModsecStatus(w http.ResponseWriter, r *http.Request) {
	status := s.security.Status(r.Context())
	writeJSON(w, http.StatusOK, status.Modsec)
}

var _ = security.CheckPass
