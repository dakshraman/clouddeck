// v0.6 handlers: application runtimes, app workloads and the host firewall.
// See docs/api.md section 1.10.
package server

import (
	stdlog "log"
	"net/http"
	"strconv"

	"clouddeck/agent/internal/apps"
	"clouddeck/agent/internal/runtimes"
	"clouddeck/agent/internal/store"
)

// stdLogger adapts the agent's stdlib logger to the safeexec logger shape.
func stdLogger() func(level, message string) {
	return func(level, message string) { stdlog.Printf("apps: [%s] %s", level, message) }
}

// ---- runtimes ----

func (s *Server) handleListRuntimes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"runtimes": runtimes.Detect(),
		"supervisor": map[string]any{
			"backend": s.cfg.AppSupervisor,
			"note":    supervisorNote(s.cfg.AppSupervisor),
		},
	})
}

func supervisorNote(backend string) string {
	switch backend {
	case "pm2":
		return "Apps are started with PM2; pm2 must be installed and available on PATH."
	case "supervisor", "supervisord":
		return "Apps are started with supervisord program definitions."
	default:
		return "Apps run as systemd units (clouddeck-app-<site>-<name>.service)."
	}
}

// ---- apps ----

func (s *Server) handleListApps(w http.ResponseWriter, r *http.Request) {
	site := r.URL.Query().Get("site")
	if site != "" {
		writeJSON(w, http.StatusOK, map[string]any{"apps": nonNilSlice(s.apps.ListForSite(r.Context(), site))})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": nonNilSlice(s.apps.List(r.Context()))})
}

func (s *Server) handleCreateApp(w http.ResponseWriter, r *http.Request) {
	var req apps.CreateInput
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	app, err := s.apps.Create(r.Context(), stdLogger(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, app)
}

func (s *Server) handleGetApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.apps.Get(r.Context(), r.PathValue("domain"), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleUpdateApp(w http.ResponseWriter, r *http.Request) {
	var req apps.CreateInput
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	app, err := s.apps.Update(r.Context(), stdLogger(), r.PathValue("domain"), r.PathValue("name"), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleDeleteApp(w http.ResponseWriter, r *http.Request) {
	if err := s.apps.Delete(r.Context(), stdLogger(), r.PathValue("domain"), r.PathValue("name")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStartApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.apps.StartApp(r.Context(), stdLogger(), r.PathValue("domain"), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleStopApp(w http.ResponseWriter, r *http.Request) {
	app, err := s.apps.StopApp(r.Context(), stdLogger(), r.PathValue("domain"), r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, app)
}

func (s *Server) handleAppLogs(w http.ResponseWriter, r *http.Request) {
	lines := 200
	if raw := r.URL.Query().Get("lines"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			lines = parsed
		}
	}
	logs, err := s.apps.Logs(r.PathValue("domain"), r.PathValue("name"), lines)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": logs})
}

// ---- firewall ----

func (s *Server) handleFirewallStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.firewall.Status(r.Context()))
}

func (s *Server) handleFirewallAddRule(w http.ResponseWriter, r *http.Request) {
	var req store.FirewallRule
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	rule, err := s.firewall.AddRule(r.Context(), stdLogger(), req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, rule)
}

func (s *Server) handleFirewallDeleteRule(w http.ResponseWriter, r *http.Request) {
	if err := s.firewall.DeleteRule(r.Context(), stdLogger(), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallSetEnabled(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	status, err := s.firewall.SetEnabled(r.Context(), stdLogger(), req.Enabled)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}
