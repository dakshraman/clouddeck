// v0.6 handlers: application runtimes, app workloads and the host firewall.
// See docs/api.md section 1.10.
package server

import (
	"context"
	"fmt"
	stdlog "log"
	"net/http"
	"strconv"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/apps"
	"clouddeck/agent/internal/runtimes"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// stdLogger adapts the agent's stdlib logger to the safeexec logger shape.
func stdLogger() func(level, message string) {
	return func(level, message string) { stdlog.Printf("apps: [%s] %s", level, message) }
}

// ---- runtimes ----

func (s *Server) handleListRuntimes(w http.ResponseWriter, r *http.Request) {
	infos := runtimes.Detect()
	for i := range infos {
		if infos[i].Kind == runtimes.KindPHP {
			infos[i].Versions = runtimes.PHPVersions(s.cfg.PHPBase)
			infos[i].Available = len(infos[i].Versions) > 0
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"runtimes":    infos,
		"installable": runtimes.Installable(),
		"supervisor": map[string]any{
			"backend": s.cfg.AppSupervisor,
			"note":    supervisorNote(s.cfg.AppSupervisor),
		},
	})
}

// handleRuntimeInstall starts a background task installing one runtime
// version. Errors: 400 invalid_kind/invalid_version, 409 dry_run.
func (s *Server) handleRuntimeInstall(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Kind    string `json:"kind"`
		Version string `json:"version"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	installer := runtimes.NewInstaller(s.cfg, s.audit)
	if err := installer.Validate(req.Kind, req.Version); err != nil {
		writeError(w, err)
		return
	}
	if installer.Installed(req.Kind, req.Version) {
		writeError(w, apierr.Conflict("already_installed",
			fmt.Sprintf("%s %s is already installed", req.Kind, req.Version)))
		return
	}
	kind, version := req.Kind, req.Version
	task, err := s.eng.Create("runtime.install", "", func(ctx context.Context, log tasks.LogFunc) error {
		return installer.Install(ctx, log, kind, version)
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"task": task})
}

// handleRuntimeUninstall starts a background task removing one runtime
// version. Refuses while a site or app still references it. Errors:
// 400 invalid_kind/invalid_version, 404 not_installed, 409 dry_run/runtime_in_use.
func (s *Server) handleRuntimeUninstall(w http.ResponseWriter, r *http.Request) {
	kind, version := r.PathValue("kind"), r.PathValue("version")
	installer := runtimes.NewInstaller(s.cfg, s.audit)
	if err := installer.ValidateUninstall(kind, version); err != nil {
		writeError(w, err)
		return
	}
	if !installer.Installed(kind, version) {
		writeError(w, apierr.NotFound("not_installed",
			fmt.Sprintf("%s %s is not installed", kind, version)))
		return
	}
	if usedBy := s.runtimeUsedBy(r.Context(), kind, version); usedBy != "" {
		writeError(w, apierr.Conflict("runtime_in_use",
			fmt.Sprintf("%s %s is used by %s; switch it first", kind, version, usedBy)))
		return
	}
	task, err := s.eng.Create("runtime.uninstall", "", func(ctx context.Context, log tasks.LogFunc) error {
		return installer.Uninstall(ctx, log, kind, version)
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"task": task})
}

// runtimeUsedBy names the site/app that still references a runtime, or "".
func (s *Server) runtimeUsedBy(ctx context.Context, kind, version string) string {
	version = strings.TrimPrefix(version, "v")
	switch kind {
	case runtimes.KindPHP:
		for _, site := range s.sites.List() {
			if site.PHPVersion == version {
				return "site " + site.Domain
			}
		}
	case runtimes.KindNode:
		sameMajor := func(candidate string) bool {
			candidate = strings.TrimPrefix(candidate, "v")
			return candidate == version ||
				strings.HasPrefix(candidate, version+".") ||
				strings.HasPrefix(version, candidate+".")
		}
		for _, app := range s.apps.List(ctx) {
			if app.Kind != runtimes.KindNode {
				continue
			}
			if sameMajor(app.Version) ||
				strings.Contains(app.Bin, "/opt/nodejs/v"+version+".") {
				return fmt.Sprintf("app %s on %s", app.Name, app.Site)
			}
		}
	}
	return ""
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
	site := r.PathValue("domain")
	if site == "" {
		site = r.URL.Query().Get("site")
	}
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
