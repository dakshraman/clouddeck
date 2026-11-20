package server

import (
	"net/http"

	"clouddeck/agent/internal/apierr"
)

// handleGetSiteAnalytics returns detailed visitor and traffic analytics for a single site.
func (s *Server) handleGetSiteAnalytics(w http.ResponseWriter, r *http.Request) {
	if s.analytics == nil {
		writeError(w, apierr.Internal("analytics service is not configured"))
		return
	}

	domain := r.PathValue("domain")
	timeframe := r.URL.Query().Get("timeframe")
	if timeframe == "" {
		timeframe = "24h"
	}

	data, err := s.analytics.GetSiteAnalytics(r.Context(), domain, timeframe)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, data)
}

// handleGetSystemAnalytics aggregates traffic analytics across all sites on the server.
func (s *Server) handleGetSystemAnalytics(w http.ResponseWriter, r *http.Request) {
	if s.analytics == nil {
		writeError(w, apierr.Internal("analytics service is not configured"))
		return
	}

	timeframe := r.URL.Query().Get("timeframe")
	if timeframe == "" {
		timeframe = "24h"
	}

	data, err := s.analytics.GetSystemAnalytics(r.Context(), timeframe)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, data)
}
