package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/alerts"
	"clouddeck/agent/internal/apierr"
)

// handleGetAlertsConfig returns the active alert configuration and thresholds.
func (s *Server) handleGetAlertsConfig(w http.ResponseWriter, r *http.Request) {
	if s.alerts == nil {
		writeError(w, apierr.Internal("alerts service is not initialized"))
		return
	}
	conf := s.alerts.GetConfig()
	writeJSON(w, http.StatusOK, conf)
}

// handleUpdateAlertsConfig updates and persists alert notification channels and thresholds.
func (s *Server) handleUpdateAlertsConfig(w http.ResponseWriter, r *http.Request) {
	if s.alerts == nil {
		writeError(w, apierr.Internal("alerts service is not initialized"))
		return
	}

	var req alerts.Config
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	if err := s.alerts.UpdateConfig(r.Context(), req); err != nil {
		writeError(w, apierr.Internal("failed to update alerts config: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"config":  s.alerts.GetConfig(),
	})
}

// handleTestAlerts sends a sample notification across specified channel or all enabled channels.
func (s *Server) handleTestAlerts(w http.ResponseWriter, r *http.Request) {
	if s.alerts == nil {
		writeError(w, apierr.Internal("alerts service is not initialized"))
		return
	}

	var req struct {
		Channel string `json:"channel"` // "telegram" | "discord" | "slack" | "webhook" | "all"
	}
	_ = decodeBody(w, r, &req)

	channel := strings.TrimSpace(req.Channel)
	results, err := s.alerts.Test(r.Context(), channel)
	if err != nil {
		writeError(w, apierr.Internal("failed to test alert: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"channel": channel,
		"results": results,
		"message": "Test notification dispatched successfully.",
	})
}
