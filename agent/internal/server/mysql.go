package server

import (
	"errors"
	"fmt"
	"io"
	stdlog "log"
	"net/http"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// MySQL handlers for the endpoints in docs/api.md section 1.2. All SQL is
// built by internal/mysql from validated identifiers; the API never accepts
// raw SQL. Mutations are synchronous and audited by the service.

func (s *Server) handleMySQLStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.mysql.Status())
}

func (s *Server) handleMySQLListDatabases(w http.ResponseWriter, r *http.Request) {
	databases, err := s.mysql.ListDatabases(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"databases": databases})
}

func (s *Server) handleMySQLCreateDatabase(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	database, err := s.mysql.CreateDatabase(r.Context(), req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"name": database.Name})
}

func (s *Server) handleMySQLDeleteDatabase(w http.ResponseWriter, r *http.Request) {
	name, err := s.mysql.DeleteDatabase(r.Context(), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "deleted": true})
}

func (s *Server) handleMySQLExportDatabase(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	ew := &exportStreamWriter{w: w, name: name}
	if err := s.mysql.Export(r.Context(), name, ew); err != nil {
		if !ew.headerSent {
			writeError(w, err)
			return
		}
		stdlog.Printf("server: mysql export error mid-stream for %q: %v", name, err)
		return
	}
	if !ew.headerSent {
		w.Header().Set("Content-Type", "application/sql")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.sql"`, name))
		w.WriteHeader(http.StatusOK)
	}
}

type exportStreamWriter struct {
	w          http.ResponseWriter
	name       string
	headerSent bool
}

func (e *exportStreamWriter) Write(p []byte) (int, error) {
	if !e.headerSent {
		e.w.Header().Set("Content-Type", "application/sql")
		e.w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.sql"`, e.name))
		e.headerSent = true
	}
	return e.w.Write(p)
}

func (s *Server) handleMySQLImportDatabase(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var reader io.Reader = r.Body
	defer r.Body.Close()

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		mr, err := r.MultipartReader()
		if err != nil {
			writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("invalid multipart body: %v", err)))
			return
		}
		var filePart io.Reader
		for {
			part, err := mr.NextPart()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				writeError(w, apierr.BadRequest("invalid_multipart", fmt.Sprintf("read multipart body: %v", err)))
				return
			}
			if part.FileName() != "" || part.FormName() == "file" || part.FormName() == "dump" {
				defer part.Close()
				filePart = part
				break
			}
			part.Close()
		}
		if filePart == nil {
			writeError(w, apierr.BadRequest("invalid_multipart", "no file parts in multipart body"))
			return
		}
		reader = filePart
	}

	if err := s.mysql.Import(r.Context(), name, reader); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "imported": true})
}

func (s *Server) handleMySQLListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.mysql.ListUsers(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) handleMySQLCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		User     string `json:"user"`
		Password string `json:"password"`
		Host     string `json:"host"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	created, err := s.mysql.CreateUser(r.Context(), req.User, req.Password, req.Host)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleMySQLDeleteUser(w http.ResponseWriter, r *http.Request) {
	user, err := s.mysql.DeleteUser(r.Context(), r.PathValue("user"), r.URL.Query().Get("host"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user.User, "host": user.Host, "deleted": true})
}

func (s *Server) handleMySQLGrant(w http.ResponseWriter, r *http.Request) {
	var req struct {
		User       string `json:"user"`
		Host       string `json:"host"`
		Database   string `json:"database"`
		Privileges string `json:"privileges"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	if err := s.mysql.Grant(r.Context(), req.User, req.Host, req.Database, req.Privileges); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"granted": true})
}
