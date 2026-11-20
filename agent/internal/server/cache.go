package server

import (
	"fmt"
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// handleGetSiteCache returns the FastCGI edge caching status and TTL for a site.
func (s *Server) handleGetSiteCache(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	settings, err := s.sites.GetCacheConfig(domain)
	if err != nil {
		writeError(w, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain)))
		return
	}

	writeJSON(w, http.StatusOK, settings)
}

// handleSetSiteCache enables/disables FastCGI edge caching and updates TTL.
func (s *Server) handleSetSiteCache(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	var req struct {
		Enabled bool   `json:"enabled"`
		TTL     string `json:"ttl"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	settings, err := s.sites.SetCacheConfig(r.Context(), domain, req.Enabled, req.TTL)
	if err != nil {
		writeError(w, apierr.Internal("failed to update cache config: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"cache":   settings,
	})
}

// handlePurgeSiteCache flushes the FastCGI cache on disk for a site.
func (s *Server) handlePurgeSiteCache(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(r.PathValue("domain"))
	if domain == "" {
		writeError(w, apierr.BadRequest("missing_domain", "domain is required"))
		return
	}

	if err := s.sites.PurgeCache(r.Context(), domain); err != nil {
		writeError(w, apierr.Internal("failed to purge cache: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"domain":  domain,
		"message": "FastCGI edge cache purged successfully",
	})
}
