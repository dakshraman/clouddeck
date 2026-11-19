package server

import (
	"context"
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/runtimes"
	"clouddeck/agent/internal/tasks"
)

// handlePHPExtensions handles GET /v1/runtimes/php/extensions and GET /api/runtimes/php/extensions
func (s *Server) handlePHPExtensions(w http.ResponseWriter, r *http.Request) {
	version := r.URL.Query().Get("version")
	res, err := runtimes.ListExtensions(version)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handlePHPExtensionInstall handles POST /v1/runtimes/php/extensions/install and POST /api/runtimes/php/extensions/install
func (s *Server) handlePHPExtensionInstall(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Version   string `json:"version"`
		Extension string `json:"extension"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if req.Extension == "" {
		writeError(w, apierr.BadRequest("missing_extension", "extension parameter is required"))
		return
	}

	task, err := s.eng.Create("php.extension.install", "", func(ctx context.Context, log tasks.LogFunc) error {
		return runtimes.InstallExtension(ctx, log, req.Version, req.Extension)
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"task": task})
}

// handlePHPExtensionToggle handles POST /v1/runtimes/php/extensions/toggle and POST /api/runtimes/php/extensions/toggle
func (s *Server) handlePHPExtensionToggle(w http.ResponseWriter, r *http.Request) {
	var req runtimes.ToggleExtensionRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if req.Extension == "" {
		writeError(w, apierr.BadRequest("missing_extension", "extension parameter is required"))
		return
	}

	if err := runtimes.ToggleExtension(req.Version, req.Extension, req.Enabled); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, runtimes.ToggleExtensionResponse{
		Success:   true,
		Version:   req.Version,
		Extension: req.Extension,
		Enabled:   req.Enabled,
	})
}

// handlePHPConfigGet handles GET /v1/runtimes/php/config and GET /api/runtimes/php/config
func (s *Server) handlePHPConfigGet(w http.ResponseWriter, r *http.Request) {
	version := r.URL.Query().Get("version")
	res, err := runtimes.GetPHPConfig(version)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handlePHPConfigSet handles POST /v1/runtimes/php/config and POST /api/runtimes/php/config
func (s *Server) handlePHPConfigSet(w http.ResponseWriter, r *http.Request) {
	var req runtimes.SetPHPConfigRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	res, err := runtimes.SetPHPConfig(req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
