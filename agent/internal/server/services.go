package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
)

func (s *Server) checkServices(w http.ResponseWriter) bool {
	if s.services == nil {
		writeError(w, apierr.New(http.StatusServiceUnavailable, "services_unavailable", "services manager is not configured"))
		return false
	}
	return true
}

func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
	if !s.checkServices(w) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": s.services.List(r.Context())})
}

func (s *Server) handleRestartService(w http.ResponseWriter, r *http.Request) {
	if !s.checkServices(w) {
		return
	}
	status, err := s.services.Restart(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleStopService(w http.ResponseWriter, r *http.Request) {
	if !s.checkServices(w) {
		return
	}
	status, err := s.services.Stop(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleStartService(w http.ResponseWriter, r *http.Request) {
	if !s.checkServices(w) {
		return
	}
	status, err := s.services.Start(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleRepairService(w http.ResponseWriter, r *http.Request) {
	if !s.checkServices(w) {
		return
	}
	status, err := s.services.Repair(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}
