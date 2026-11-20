package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/fleet"
)

func (s *Server) handleListFleetNodes(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	nodes := s.fleet.ListNodes()
	writeJSON(w, http.StatusOK, map[string]any{"nodes": nodes})
}

func (s *Server) handleRegisterFleetNode(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	var in fleet.RegisterNodeInput
	if err := decodeBody(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	node, err := s.fleet.RegisterNode(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleGetFleetNode(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	id := r.PathValue("id")
	node, err := s.fleet.GetNode(id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleUpdateFleetNode(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	id := r.PathValue("id")
	var in fleet.UpdateNodeInput
	if err := decodeBody(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	node, err := s.fleet.UpdateNode(r.Context(), id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleDeleteFleetNode(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	id := r.PathValue("id")
	if err := s.fleet.DeleteNode(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": id})
}

func (s *Server) handlePingFleetNode(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	id := r.PathValue("id")
	node, err := s.fleet.PingNode(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleGetFleetOverview(w http.ResponseWriter, r *http.Request) {
	if s.fleet == nil {
		writeError(w, apierr.Internal("fleet service is not configured"))
		return
	}
	overview := s.fleet.GetOverview(r.Context())
	writeJSON(w, http.StatusOK, overview)
}
