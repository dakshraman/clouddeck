package server

import (
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// handlePostgresStatus returns PostgreSQL server health, port, and metrics.
func (s *Server) handlePostgresStatus(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	status := s.postgres.Status(r.Context())
	writeJSON(w, http.StatusOK, status)
}

// handlePostgresListDatabases lists all PostgreSQL databases.
func (s *Server) handlePostgresListDatabases(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	databases, err := s.postgres.ListDatabases(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"databases": databases,
	})
}

// handlePostgresCreateDatabase creates a new PostgreSQL database.
func (s *Server) handlePostgresCreateDatabase(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	var req struct {
		Name  string `json:"name"`
		Owner string `json:"owner"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	db, err := s.postgres.CreateDatabase(r.Context(), req.Name, req.Owner)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"success":  true,
		"database": db,
	})
}

// handlePostgresDeleteDatabase drops a PostgreSQL database.
func (s *Server) handlePostgresDeleteDatabase(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		writeError(w, apierr.BadRequest("missing_name", "database name is required"))
		return
	}

	if err := s.postgres.DeleteDatabase(r.Context(), name); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"name":    name,
	})
}

// handlePostgresListUsers lists all PostgreSQL roles.
func (s *Server) handlePostgresListUsers(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	users, err := s.postgres.ListUsers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"users": users,
	})
}

// handlePostgresCreateUser creates a PostgreSQL role and connection URI.
func (s *Server) handlePostgresCreateUser(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	var req struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		Superuser bool   `json:"superuser"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	user, err := s.postgres.CreateUser(r.Context(), req.Username, req.Password, req.Superuser)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"success": true,
		"user":    user,
	})
}

// handlePostgresDeleteUser drops a PostgreSQL role.
func (s *Server) handlePostgresDeleteUser(w http.ResponseWriter, r *http.Request) {
	if s.postgres == nil {
		writeError(w, apierr.Internal("postgres service is not initialized"))
		return
	}

	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		writeError(w, apierr.BadRequest("missing_name", "username is required"))
		return
	}

	if err := s.postgres.DeleteUser(r.Context(), name); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"username": name,
	})
}
