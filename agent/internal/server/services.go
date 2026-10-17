package server

import "net/http"

func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"services": s.services.List(r.Context())})
}

func (s *Server) handleRestartService(w http.ResponseWriter, r *http.Request) {
	status, err := s.services.Restart(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}
