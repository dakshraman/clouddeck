package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// handleCachingStatus returns the current status and metrics for Redis & Memcached.
func (s *Server) handleCachingStatus(w http.ResponseWriter, r *http.Request) {
	if s.caching == nil {
		writeError(w, apierr.Internal("caching service is not initialized"))
		return
	}
	status := s.caching.Status(r.Context())
	writeJSON(w, http.StatusOK, status)
}

// handleRedisToggle changes the Redis daemon state (start, stop, restart).
func (s *Server) handleRedisToggle(w http.ResponseWriter, r *http.Request) {
	if s.caching == nil {
		writeError(w, apierr.Internal("caching service is not initialized"))
		return
	}

	var req struct {
		Action string `json:"action"` // "start" | "stop" | "restart"
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	action := strings.TrimSpace(req.Action)
	if action == "" {
		writeError(w, apierr.BadRequest("missing_action", "action field is required (start, stop, restart)"))
		return
	}

	if err := s.caching.Toggle(r.Context(), action); err != nil {
		writeError(w, apierr.Internal("failed to toggle redis: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"action":  action,
		"status":  s.caching.Status(r.Context()).Redis,
	})
}

// handleRedisFlush flushes all keys from the Redis in-memory cache.
func (s *Server) handleRedisFlush(w http.ResponseWriter, r *http.Request) {
	if s.caching == nil {
		writeError(w, apierr.Internal("caching service is not initialized"))
		return
	}

	if err := s.caching.Flush(r.Context()); err != nil {
		writeError(w, apierr.Internal("failed to flush redis: "+err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Redis in-memory cache flushed successfully",
	})
}
