package server

import (
	"net/http"

	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/tunnel"
)

func (s *Server) getTunnelService() *tunnel.Service {
	if s.tunnel == nil {
		s.tunnel = tunnel.New(s.cfg)
	}
	return s.tunnel
}

func (s *Server) handleStartTunnel(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		writeError(w, err)
		return
	}

	tun, err := s.getTunnelService().StartTunnel(r.Context(), normalized)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tun)
}

func (s *Server) handleStopTunnel(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		writeError(w, err)
		return
	}

	if err := s.getTunnelService().StopTunnel(r.Context(), normalized); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"stopped": true})
}

func (s *Server) handleGetTunnel(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		writeError(w, err)
		return
	}

	tun, ok := s.getTunnelService().GetTunnel(normalized)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"status": "inactive"})
		return
	}
	writeJSON(w, http.StatusOK, tun)
}

func (s *Server) handleListTunnels(w http.ResponseWriter, r *http.Request) {
	tunnels := s.getTunnelService().ListTunnels()
	writeJSON(w, http.StatusOK, map[string]any{"tunnels": tunnels})
}
