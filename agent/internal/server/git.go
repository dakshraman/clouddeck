package server

import (
	"fmt"
	"io"
	"net/http"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/git"
)

func (s *Server) handleGetSiteGit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	cfg, err := s.git.Get(domain)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleSaveSiteGit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	var req git.SaveInput
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	cfg, err := s.git.Save(domain, req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleRemoveSiteGit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	if err := s.git.Remove(domain); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed", "domain": domain})
}

func (s *Server) handleDeploySiteGit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	record, err := s.git.Deploy(r.Context(), domain, "manual")
	if err != nil {
		writeError(w, apierr.Internal(fmt.Sprintf("deploy: %v", err)))
		return
	}
	writeJSON(w, http.StatusOK, record)
}

func (s *Server) handleGetSiteGitHistory(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	cfg, err := s.git.Get(domain)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"history": cfg.History})
}

func (s *Server) handleWebhookSiteGit(w http.ResponseWriter, r *http.Request) {
	if s.git == nil {
		writeError(w, apierr.Internal("git service is not configured"))
		return
	}
	domain := r.PathValue("domain")
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		writeError(w, apierr.BadRequest("body_too_large", "request body exceeds maximum allowed size"))
		return
	}

	queryToken := r.URL.Query().Get("token")
	record, err := s.git.HandleWebhook(domain, r.Header, queryToken, body)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, record)
}

