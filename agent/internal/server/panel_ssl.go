package server

import (
	"net/http"

	"clouddeck/agent/internal/ssl"
)

func (s *Server) getPanelSSL() *ssl.PanelSSL {
	if s.panelSSL != nil {
		return s.panelSSL
	}
	return ssl.NewPanelSSL(s.cfg)
}

func (s *Server) handleGetPanelSSL(w http.ResponseWriter, r *http.Request) {
	status, err := s.getPanelSSL().GetPanelSSLStatus()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleInstallPanelSSL(w http.ResponseWriter, r *http.Request) {
	var req ssl.PanelSSLInstallRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	status, err := s.getPanelSSL().InstallPanelSSL(r.Context(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleDisablePanelSSL(w http.ResponseWriter, r *http.Request) {
	if err := s.getPanelSSL().DisablePanelSSL(r.Context()); err != nil {
		writeError(w, err)
		return
	}
	status, err := s.getPanelSSL().GetPanelSSLStatus()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}
