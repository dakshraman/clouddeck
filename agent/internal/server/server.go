// Package server exposes the agent's HTTP/JSON API on the configured listen
// address. All routes use Go 1.22+ ServeMux patterns.
package server

import (
	"encoding/json"
	"fmt"
	stdlog "log"
	"net/http"
	"os"
	"runtime"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/files"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/php"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/ssl"
	"clouddeck/agent/internal/systeminfo"
	"clouddeck/agent/internal/tasks"
)

// Version is the agent version reported by /v1/health.
const Version = "0.2.2"

const maxBodyBytes = 1 << 20

// Server wires the HTTP routes to the agent services.
type Server struct {
	cfg   config.Config
	eng   *tasks.Engine
	sites *sites.Service
	ssl   *ssl.Issuer
	files *files.Service
	mysql *mysql.Service
}

// New builds the HTTP handler.
func New(cfg config.Config, eng *tasks.Engine, siteSvc *sites.Service, sslIssuer *ssl.Issuer, fileSvc *files.Service, mysqlSvc *mysql.Service) http.Handler {
	s := &Server{cfg: cfg, eng: eng, sites: siteSvc, ssl: sslIssuer, files: fileSvc, mysql: mysqlSvc}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/system", s.handleSystem)
	mux.HandleFunc("GET /v1/php/versions", s.handlePHPVersions)
	mux.HandleFunc("GET /v1/sites", s.handleListSites)
	mux.HandleFunc("POST /v1/sites", s.handleCreateSite)
	mux.HandleFunc("GET /v1/sites/{domain}", s.handleGetSite)
	mux.HandleFunc("DELETE /v1/sites/{domain}", s.handleDeleteSite)
	mux.HandleFunc("POST /v1/sites/{domain}/ssl", s.handleIssueSSL)

	mux.HandleFunc("GET /v1/sites/{domain}/files", s.handleFileList)
	mux.HandleFunc("GET /v1/sites/{domain}/files/content", s.handleFileRead)
	mux.HandleFunc("PUT /v1/sites/{domain}/files/content", s.handleFileWrite)
	mux.HandleFunc("GET /v1/sites/{domain}/files/download", s.handleFileDownload)
	mux.HandleFunc("POST /v1/sites/{domain}/files/upload", s.handleFileUpload)
	mux.HandleFunc("POST /v1/sites/{domain}/files/mkdir", s.handleFileMkdir)
	mux.HandleFunc("POST /v1/sites/{domain}/files/rename", s.handleFileRename)
	mux.HandleFunc("DELETE /v1/sites/{domain}/files", s.handleFileDelete)

	mux.HandleFunc("GET /v1/mysql/status", s.handleMySQLStatus)
	mux.HandleFunc("GET /v1/mysql/databases", s.handleMySQLListDatabases)
	mux.HandleFunc("POST /v1/mysql/databases", s.handleMySQLCreateDatabase)
	mux.HandleFunc("DELETE /v1/mysql/databases/{name}", s.handleMySQLDeleteDatabase)
	mux.HandleFunc("GET /v1/mysql/users", s.handleMySQLListUsers)
	mux.HandleFunc("POST /v1/mysql/users", s.handleMySQLCreateUser)
	mux.HandleFunc("DELETE /v1/mysql/users/{user}", s.handleMySQLDeleteUser)
	mux.HandleFunc("POST /v1/mysql/grants", s.handleMySQLGrant)

	mux.HandleFunc("GET /v1/tasks", s.handleListTasks)
	mux.HandleFunc("GET /v1/tasks/{id}", s.handleGetTask)
	mux.HandleFunc("/", s.handleNotFound)

	return logRequests(mux)
}

type errorBody struct {
	Error errorInfo `json:"error"`
}

type errorInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	hostname, err := os.Hostname()
	if err != nil {
		hostname = ""
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"version":  Version,
		"hostname": hostname,
		"os":       runtime.GOOS + "/" + runtime.GOARCH,
		"dryRun":   s.cfg.DryRun,
	})
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	info := systeminfo.Collect()
	info.DryRun = s.cfg.DryRun
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handlePHPVersions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"versions": php.Available(s.cfg.PHPBase)})
}

func (s *Server) handleListSites(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sites": s.sites.List()})
}

func (s *Server) handleCreateSite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain     string `json:"domain"`
		PHPVersion string `json:"phpVersion"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.sites.Create(req.Domain, req.PHPVersion)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleGetSite(w http.ResponseWriter, r *http.Request) {
	site, err := s.sites.Get(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, site)
}

func (s *Server) handleDeleteSite(w http.ResponseWriter, r *http.Request) {
	task, err := s.sites.Delete(r.PathValue("domain"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleIssueSSL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	task, err := s.ssl.Issue(r.PathValue("domain"), req.Email)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"taskId": task.ID})
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"tasks": s.eng.List()})
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	task, ok := s.eng.Get(id)
	if !ok {
		writeError(w, apierr.NotFound("task_not_found", fmt.Sprintf("task %q does not exist", id)))
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, apierr.NotFound("not_found", fmt.Sprintf("no endpoint for %s %s", r.Method, r.URL.Path)))
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(v); err != nil {
		return apierr.BadRequest("invalid_json", fmt.Sprintf("invalid request body: %v", err))
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		stdlog.Printf("server: encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, err error) {
	if apiErr, ok := apierr.As(err); ok {
		writeJSON(w, apiErr.Status, errorBody{Error: errorInfo{Code: apiErr.Code, Message: apiErr.Message}})
		return
	}
	writeJSON(w, http.StatusInternalServerError, errorBody{Error: errorInfo{Code: "internal", Message: err.Error()}})
}

// logRequests writes one line per request and records the response status.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		stdlog.Printf("%s %s -> %d (%s)", r.Method, r.URL.Path, sw.status, time.Since(start).Round(time.Millisecond))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
