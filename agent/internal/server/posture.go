package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
)

// handleGetSecurityPosture returns cached or latest host security score and findings.
func (s *Server) handleGetSecurityPosture(w http.ResponseWriter, r *http.Request) {
	if s.security == nil {
		writeError(w, apierr.Internal("security service is not initialized"))
		return
	}

	posture := s.security.GetPosture(r.Context())
	writeJSON(w, http.StatusOK, posture)
}

// handleScanSecurityPosture triggers a full security audit across SSH, ports, permissions, and TLS.
func (s *Server) handleScanSecurityPosture(w http.ResponseWriter, r *http.Request) {
	if s.security == nil {
		writeError(w, apierr.Internal("security service is not initialized"))
		return
	}

	report, err := s.security.Scan(r.Context())
	if err != nil {
		writeError(w, apierr.Internal("security scan failed: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, report)
}

// handleHardenSecurity applies 1-click automated security hardening.
func (s *Server) handleHardenSecurity(w http.ResponseWriter, r *http.Request) {
	if s.security == nil {
		writeError(w, apierr.Internal("security service is not initialized"))
		return
	}

	result, err := s.security.AutoHarden(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, result)
}
