package server

import (
	"net/http"
	"strconv"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/appstore"
)

func (s *Server) handleGetAppStoreCatalog(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	catalog := s.appstore.GetCatalog()
	writeJSON(w, http.StatusOK, map[string]any{"catalog": catalog})
}

func (s *Server) handleListInstalledApps(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	apps := s.appstore.ListInstalled()
	writeJSON(w, http.StatusOK, map[string]any{"apps": apps})
}

func (s *Server) handleInstallApp(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	var in appstore.InstallAppInput
	if err := decodeBody(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	app, err := s.appstore.Install(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleInstallCustomApp(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	var in appstore.InstallCustomAppInput
	if err := decodeBody(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	app, err := s.appstore.InstallCustom(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleAppAction(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	id := r.PathValue("id")
	var req struct {
		Action string `json:"action"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	res, err := s.appstore.Action(r.Context(), id, req.Action)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleUninstallApp(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	id := r.PathValue("id")
	if err := s.appstore.Uninstall(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "uninstalled", "id": id})
}

func (s *Server) handleGetAppLogs(w http.ResponseWriter, r *http.Request) {
	if s.appstore == nil {
		writeError(w, apierr.Internal("appstore service is not configured"))
		return
	}
	id := r.PathValue("id")
	tail := 100
	if tailStr := r.URL.Query().Get("tail"); tailStr != "" {
		if parsed, err := strconv.Atoi(tailStr); err == nil && parsed > 0 {
			tail = parsed
		}
	}
	logs, err := s.appstore.GetLogs(r.Context(), id, tail)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "logs": logs})
}
