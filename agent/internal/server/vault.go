package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
)

// handleGetAgentKeys returns all configured and available AI provider keys masked for safety.
func (s *Server) handleGetAgentKeys(w http.ResponseWriter, r *http.Request) {
	if s.agents == nil || s.agents.Vault == nil {
		writeError(w, apierr.Internal("agents vault is not initialized"))
		return
	}
	keys := s.agents.Vault.GetMaskedKeys(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"keys": keys,
	})
}

// handleSetAgentKeys updates or deletes stored AI provider keys in the secure vault.
func (s *Server) handleSetAgentKeys(w http.ResponseWriter, r *http.Request) {
	if s.agents == nil || s.agents.Vault == nil {
		writeError(w, apierr.Internal("agents vault is not initialized"))
		return
	}

	var req struct {
		Keys map[string]string `json:"keys"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	if err := s.agents.Vault.SetKeys(r.Context(), req.Keys); err != nil {
		writeError(w, apierr.Internal("failed to update keys: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"keys":    s.agents.Vault.GetMaskedKeys(r.Context()),
	})
}
