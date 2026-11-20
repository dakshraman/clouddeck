package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/wordpress"
)

// handleGetWordPressStatus returns the WordPress installation and plugin/theme status.
func (s *Server) handleGetWordPressStatus(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	status, err := s.wordpress.Status(r.Context(), domain)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, status)
}

// handleInstallWordPress performs a 1-click install of WordPress with database & salts.
func (s *Server) handleInstallWordPress(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	var req wordpress.WPInstallRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	res, err := s.wordpress.Install(r.Context(), domain, req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleStageWordPress clones the site to staging.<domain> with isolated DB.
func (s *Server) handleStageWordPress(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	res, err := s.wordpress.CloneToStaging(r.Context(), domain)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleLoginWordPress generates a single-use passwordless admin magic login URL.
func (s *Server) handleLoginWordPress(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	res, err := s.wordpress.GenerateMagicLogin(r.Context(), domain)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handleUpdateWordPress updates core, plugins, or themes.
func (s *Server) handleUpdateWordPress(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	var req wordpress.WPUpdateRequest
	if err := decodeBody(w, r, &req); err != nil {
		// Default to all if empty body
		req.Target = "all"
	}

	res, err := s.wordpress.Update(r.Context(), domain, req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}

// handlePushStagingWordPress pushes staging changes back into production with safety backup.
func (s *Server) handlePushStagingWordPress(w http.ResponseWriter, r *http.Request) {
	if s.wordpress == nil {
		writeError(w, apierr.Internal("wordpress service is not initialized"))
		return
	}
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	res, err := s.wordpress.PushStaging(r.Context(), domain)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, res)
}
