// Service coordinates app workloads: validation, state, supervision and the
// nginx proxy entries that expose them.
package apps

import (
	"context"
	"fmt"
	"os"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/runtimes"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/store"
)

// Service owns application workloads for every site.
type Service struct {
	st    *store.Store
	cfg   config.Config
	audit *audit.Log

	// nginx re-renders the owning site's vhost after app changes. It is wired
	// by main so the apps package stays independent of sites.
	nginx func(ctx context.Context, log safeexec.Logger, domain string) error
}

// New creates the apps service.
func New(st *store.Store, cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{st: st, cfg: cfg, audit: auditLog}
}

// SetNginxApplier wires vhost re-rendering. It must be called before the
// server starts handling requests.
func (s *Service) SetNginxApplier(fn func(ctx context.Context, log safeexec.Logger, domain string) error) {
	s.nginx = fn
}

// reconcile re-renders the site's vhost so nginx matches the current app set.
func (s *Service) reconcile(ctx context.Context, log safeexec.Logger, site string) error {
	if s.nginx == nil {
		return nil
	}
	if err := s.nginx(ctx, log, site); err != nil {
		log("warn", fmt.Sprintf("re-render nginx for %s: %v", site, err))
		return err
	}
	return nil
}

// List returns every app with live status.
func (s *Service) List(ctx context.Context) []App {
	apps := s.st.ListApps()
	out := make([]App, 0, len(apps))
	for _, app := range apps {
		spec := specFromStore(app)
		out = append(out, App{Spec: spec, Status: s.liveStatus(ctx, spec)})
	}
	return out
}

// ListForSite returns the apps belonging to one site.
func (s *Service) ListForSite(ctx context.Context, site string) []App {
	all := s.List(ctx)
	out := make([]App, 0, len(all))
	for _, app := range all {
		if app.Site == site {
			out = append(out, app)
		}
	}
	return out
}

// Get returns one app with live status.
func (s *Service) Get(ctx context.Context, site, name string) (App, error) {
	app, ok := s.st.GetApp(site, name)
	if !ok {
		return App{}, apierr.NotFound("app_not_found", fmt.Sprintf("app %q does not exist on %s", name, site))
	}
	spec := specFromStore(app)
	return App{Spec: spec, Status: s.liveStatus(ctx, spec)}, nil
}

// CreateInput is the request body for a new app.
type CreateInput struct {
	Site        string            `json:"site"`
	Name        string            `json:"name"`
	Kind        string            `json:"kind"`
	Version     string            `json:"version"`
	Bin         string            `json:"bin"`
	Command     string            `json:"command"`
	Dir         string            `json:"dir"`
	Port        int               `json:"port"`
	Env         map[string]string `json:"env"`
	HealthPath  string            `json:"healthPath"`
	RunAs       string            `json:"runAs"`
	AutoRestart *bool             `json:"autoRestart"`
}

// Create validates and persists a new app, then starts it.
func (s *Service) Create(ctx context.Context, log safeexec.Logger, in CreateInput) (App, error) {
	site, err := s.siteFor(in.Site)
	if err != nil {
		return App{}, err
	}
	name, err := ValidateName(in.Name)
	if err != nil {
		return App{}, err
	}
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	if kind == "" {
		kind = runtimes.KindNode
	}
	if !runtimes.ValidKind(kind) || !runtimes.IsApp(kind) {
		return App{}, apierr.BadRequest("invalid_runtime",
			fmt.Sprintf("runtime %q cannot be hosted as an app; choose node, python, go, ruby or custom", kind))
	}
	command, err := ValidateCommand(in.Command)
	if err != nil {
		return App{}, err
	}
	port := in.Port
	if port == 0 {
		port = runtimes.DefaultPort(kind)
	}
	port, err = ValidatePort(port)
	if err != nil {
		return App{}, err
	}
	dir, err := ValidatePath(site.Root, in.Dir)
	if err != nil {
		return App{}, err
	}
	env, err := ValidateEnv(in.Env)
	if err != nil {
		return App{}, err
	}
	if _, exists := s.st.GetApp(site.Domain, name); exists {
		return App{}, apierr.Conflict("app_exists", fmt.Sprintf("app %q already exists on %s", name, site.Domain))
	}
	if in.Port == 0 {
		port, err = s.allocatePort(site.Domain, kind)
		if err != nil {
			return App{}, err
		}
	}
	if err := s.checkPortFree(site.Domain, port); err != nil {
		return App{}, err
	}
	if err := s.ensureRuntime(kind, in.Version, in.Bin); err != nil {
		return App{}, err
	}

	autoRestart := true
	if in.AutoRestart != nil {
		autoRestart = *in.AutoRestart
	}
	now := store.Now()
	runAs := strings.TrimSpace(in.RunAs)
	if runAs == "" {
		runAs = s.cfg.WebRunAs
	}
	app := store.App{
		ID:          NewID(),
		Site:        site.Domain,
		Name:        name,
		Kind:        kind,
		Version:     strings.TrimSpace(in.Version),
		Bin:         strings.TrimSpace(in.Bin),
		Command:     command,
		Dir:         dir,
		Port:        port,
		Env:         env,
		HealthPath:  normalizeHealthPath(in.HealthPath),
		RunAs:       runAs,
		Supervisor:  supervisorName(s.cfg.AppSupervisor),
		AutoRestart: autoRestart,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.st.CreateApp(app); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("persist app: %v", err))
	}
	s.record(audit.Record{Action: "app.create", Params: map[string]any{"site": app.Site, "name": app.Name, "kind": app.Kind, "port": app.Port}, Result: audit.ResultAccepted})

	spec := specFromStore(app)
	if err := s.Start(ctx, log, spec); err != nil {
		_ = s.st.DeleteApp(app.Site, app.Name)
		return App{}, apierr.Internal(fmt.Sprintf("start app: %v", err))
	}
	if err := s.reconcile(ctx, log, app.Site); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("update nginx for %s: %v", app.Site, err))
	}
	return s.Get(ctx, app.Site, app.Name)
}

// Update changes the mutable parts of an app and restarts it.
func (s *Service) Update(ctx context.Context, log safeexec.Logger, site, name string, in CreateInput) (App, error) {
	current, ok := s.st.GetApp(site, name)
	if !ok {
		return App{}, apierr.NotFound("app_not_found", fmt.Sprintf("app %q does not exist on %s", name, site))
	}
	if strings.TrimSpace(in.Command) != "" {
		command, err := ValidateCommand(in.Command)
		if err != nil {
			return App{}, err
		}
		current.Command = command
	}
	if in.Port != 0 && in.Port != current.Port {
		port, err := ValidatePort(in.Port)
		if err != nil {
			return App{}, err
		}
		if err := s.checkPortFree(site, port); err != nil {
			return App{}, err
		}
		current.Port = port
	}
	if in.Env != nil {
		env, err := ValidateEnv(in.Env)
		if err != nil {
			return App{}, err
		}
		current.Env = env
	}
	if strings.TrimSpace(in.Dir) != "" {
		root, err := s.siteFor(site)
		if err != nil {
			return App{}, err
		}
		dir, err := ValidatePath(root.Root, in.Dir)
		if err != nil {
			return App{}, err
		}
		current.Dir = dir
	}
	if in.HealthPath != "" {
		current.HealthPath = normalizeHealthPath(in.HealthPath)
	}
	if in.AutoRestart != nil {
		current.AutoRestart = *in.AutoRestart
	}
	current.UpdatedAt = store.Now()
	if err := s.st.UpdateApp(site, name, func(app *store.App) { *app = current }); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("persist app: %v", err))
	}
	spec := specFromStore(current)
	if err := s.Restart(ctx, log, spec); err != nil {
		return App{}, err
	}
	if err := s.reconcile(ctx, log, site); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("update nginx for %s: %v", site, err))
	}
	return s.Get(ctx, site, name)
}

// Delete stops and removes an app.
func (s *Service) Delete(ctx context.Context, log safeexec.Logger, site, name string) error {
	app, ok := s.st.GetApp(site, name)
	if !ok {
		return apierr.NotFound("app_not_found", fmt.Sprintf("app %q does not exist on %s", name, site))
	}
	spec := specFromStore(app)
	if err := s.Remove(ctx, log, spec); err != nil {
		return apierr.Internal(fmt.Sprintf("remove app: %v", err))
	}
	if err := s.st.DeleteApp(site, name); err != nil {
		return apierr.Internal(fmt.Sprintf("remove app from state: %v", err))
	}
	if err := s.reconcile(ctx, log, site); err != nil {
		return apierr.Internal(fmt.Sprintf("update nginx for %s: %v", site, err))
	}
	s.record(audit.Record{Action: "app.delete", Params: map[string]any{"site": site, "name": name}, Result: audit.ResultAccepted})
	return nil
}

// StartApp starts an existing app.
func (s *Service) StartApp(ctx context.Context, log safeexec.Logger, site, name string) (App, error) {
	app, err := s.Get(ctx, site, name)
	if err != nil {
		return App{}, err
	}
	if err := s.Start(ctx, log, app.Spec); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("start app: %v", err))
	}
	return s.Get(ctx, site, name)
}

// StopApp stops an existing app.
func (s *Service) StopApp(ctx context.Context, log safeexec.Logger, site, name string) (App, error) {
	app, err := s.Get(ctx, site, name)
	if err != nil {
		return App{}, err
	}
	if err := s.Stop(ctx, log, app.Spec); err != nil {
		return App{}, apierr.Internal(fmt.Sprintf("stop app: %v", err))
	}
	return s.Get(ctx, site, name)
}

// Restart stops and starts an app (used after edits).
func (s *Service) Restart(ctx context.Context, log safeexec.Logger, app Spec) error {
	if err := s.Stop(ctx, log, app); err != nil {
		log("warn", fmt.Sprintf("stop before restart: %v", err))
	}
	return s.Start(ctx, log, app)
}

// Logs returns the tail of an app's log file.
func (s *Service) Logs(site, name string, lines int) ([]string, error) {
	app, ok := s.st.GetApp(site, name)
	if !ok {
		return nil, apierr.NotFound("app_not_found", fmt.Sprintf("app %q does not exist on %s", name, site))
	}
	if lines <= 0 || lines > 2000 {
		lines = 200
	}
	path := logDir(s.cfg.StateDir, app.Site, app.Name) + "/app.log"
	return tailFile(path, lines)
}

// allocatePort picks a free local port for a new app.
func (s *Service) allocatePort(site, kind string) (int, error) {
	start := runtimes.DefaultPort(kind)
	for port := start; port < start+200; port++ {
		if s.checkPortFree(site, port) == nil && !s.portInUse(port) {
			return port, nil
		}
	}
	return 0, apierr.Conflict("no_free_port", "no free local port is available for this app")
}

// checkPortFree rejects a port already claimed by another app on the same site.
func (s *Service) checkPortFree(site string, port int) error {
	for _, app := range s.st.ListApps() {
		if app.Port == port && app.Site == site {
			return apierr.Conflict("port_in_use", fmt.Sprintf("port %d is already used by app %q on %s", port, app.Name, site))
		}
	}
	return nil
}

// portInUse checks whether something already listens on a local port.
func (s *Service) portInUse(port int) bool {
	for _, app := range s.st.ListApps() {
		if app.Port == port {
			return true
		}
	}
	return false
}

// ensureRuntime verifies that the requested runtime is installed.
func (s *Service) ensureRuntime(kind, version, bin string) error {
	if kind == runtimes.KindCustom {
		return nil
	}
	info, ok := runtimes.Lookup(kind)
	if !ok || !info.Available || len(info.Versions) == 0 {
		return apierr.BadRequest("runtime_unavailable",
			fmt.Sprintf("%s is not installed on this server; install it or choose another runtime", info.Label))
	}
	if bin != "" {
		return nil
	}
	if version != "" {
		for _, rt := range info.Versions {
			if rt.Version == version {
				return nil
			}
		}
		return apierr.BadRequest("runtime_version_unavailable",
			fmt.Sprintf("%s %s is not installed on this server", info.Label, version))
	}
	return nil
}

func (s *Service) siteFor(raw string) (store.Site, error) {
	site, ok := s.st.GetSite(strings.ToLower(strings.TrimSpace(raw)))
	if !ok {
		return store.Site{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", raw))
	}
	return site, nil
}

func (s *Service) record(rec audit.Record) {
	if err := s.audit.Append(rec); err != nil {
		// Audit failures must not block a completed operation.
		_ = err
	}
}

func normalizeHealthPath(raw string) string {
	path := strings.TrimSpace(raw)
	if path == "" {
		return ""
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return path
}

// specFromStore converts a stored app to its spec form.
func specFromStore(app store.App) Spec {
	return Spec{
		ID:          app.ID,
		Site:        app.Site,
		Name:        app.Name,
		Kind:        app.Kind,
		Version:     app.Version,
		Bin:         app.Bin,
		Command:     app.Command,
		Dir:         app.Dir,
		Port:        app.Port,
		Env:         app.Env,
		HealthPath:  app.HealthPath,
		RunAs:       app.RunAs,
		Supervisor:  app.Supervisor,
		AutoRestart: app.AutoRestart,
		CreatedAt:   app.CreatedAt,
		UpdatedAt:   app.UpdatedAt,
	}
}

// TailFile returns the last n lines of a file.
func tailFile(path string, n int) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, apierr.NotFound("log_not_found", fmt.Sprintf("no log file at %s", path))
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	if len(lines) == 1 && lines[0] == "" {
		return []string{}, nil
	}
	return lines, nil
}
