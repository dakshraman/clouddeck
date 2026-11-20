package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/rbac"
)

// handleListUsers returns all user accounts.
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if s.rbac == nil {
		writeError(w, apierr.Internal("rbac service is not initialized"))
		return
	}

	users, err := s.rbac.ListUsers()
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"users": users,
	})
}

// handleCreateUser provisions a new administrative or scoped client account.
func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if s.rbac == nil {
		writeError(w, apierr.Internal("rbac service is not initialized"))
		return
	}

	var req rbac.User
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	user, err := s.rbac.CreateUser(req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"success": true,
		"user":    user,
	})
}

// handleUpdateUser updates user role, assigned domains, quotas, or credentials.
func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	if s.rbac == nil {
		writeError(w, apierr.Internal("rbac service is not initialized"))
		return
	}

	username := strings.TrimSpace(r.PathValue("username"))
	if username == "" {
		writeError(w, apierr.BadRequest("missing_username", "username is required"))
		return
	}

	var req rbac.User
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	user, err := s.rbac.UpdateUser(username, req)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"user":    user,
	})
}

// handleDeleteUser removes an account by username.
func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if s.rbac == nil {
		writeError(w, apierr.Internal("rbac service is not initialized"))
		return
	}

	username := strings.TrimSpace(r.PathValue("username"))
	if username == "" {
		writeError(w, apierr.BadRequest("missing_username", "username is required"))
		return
	}

	if err := s.rbac.DeleteUser(username); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"username": username,
	})
}
