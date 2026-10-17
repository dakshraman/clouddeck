// Package sites manages the site lifecycle: state, webroots and nginx configs.
package sites

import (
	"context"
	"errors"
	"fmt"
	stdlog "log"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/php"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// Task types owned by this package.
const (
	TaskCreate = "site.create"
	TaskDelete = "site.delete"
)

// domainRe is the frozen domain validation regex from docs/api.md.
var domainRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

// Service coordinates site mutations.
type Service struct {
	st    *store.Store
	eng   *tasks.Engine
	audit *audit.Log
	cfg   config.Config
}

// New creates the site service.
func New(st *store.Store, eng *tasks.Engine, auditLog *audit.Log, cfg config.Config) *Service {
	return &Service{st: st, eng: eng, audit: auditLog, cfg: cfg}
}

// ValidateDomain lowercases the input and checks it against the domain regex,
// returning the normalized domain.
func ValidateDomain(raw string) (string, error) {
	domain := strings.ToLower(strings.TrimSpace(raw))
	if !domainRe.MatchString(domain) {
		return "", apierr.BadRequest("invalid_domain", fmt.Sprintf("invalid domain %q", raw))
	}
	return domain, nil
}

// List returns every site, sorted by domain.
func (s *Service) List() []store.Site {
	return s.st.ListSites()
}

// Get returns one site or a typed 400/404 error.
func (s *Service) Get(rawDomain string) (store.Site, error) {
	domain, err := ValidateDomain(rawDomain)
	if err != nil {
		return store.Site{}, err
	}
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.Site{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}
	return site, nil
}

// Create persists a provisioning site and starts its async task.
func (s *Service) Create(rawDomain, phpVersion string) (store.Task, error) {
	domain, err := ValidateDomain(rawDomain)
	if err != nil {
		return store.Task{}, err
	}
	phpVersion = strings.TrimSpace(phpVersion)
	if phpVersion == "" {
		phpVersion = "none"
	}
	if !php.Offered(s.cfg.PHPBase, phpVersion) {
		return store.Task{}, apierr.BadRequest("invalid_php_version", fmt.Sprintf("PHP version %q is not offered by this server", phpVersion))
	}
	params := map[string]any{"domain": domain, "phpVersion": phpVersion}
	if _, exists := s.st.GetSite(domain); exists {
		return store.Task{}, s.reject(TaskCreate, params, apierr.Conflict("site_exists", fmt.Sprintf("site %q already exists", domain)))
	}
	if err := s.audit.Append(audit.Record{Action: TaskCreate, Params: params, Result: audit.ResultAccepted}); err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	now := store.Now()
	site := store.Site{
		Domain:     domain,
		Root:       s.rootFor(domain),
		PHPVersion: phpVersion,
		SSL:        store.SSL{Enabled: false},
		Status:     store.SiteProvisioning,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.st.CreateSite(site); err != nil {
		if errors.Is(err, store.ErrExists) {
			return store.Task{}, s.reject(TaskCreate, params, apierr.Conflict("site_exists", fmt.Sprintf("site %q already exists", domain)))
		}
		return store.Task{}, apierr.Internal(fmt.Sprintf("persist site: %v", err))
	}

	task, err := s.eng.Create(TaskCreate, domain, func(ctx context.Context, log tasks.LogFunc) error {
		if err := s.provision(ctx, log, site); err != nil {
			s.setStatus(domain, store.SiteError)
			return err
		}
		s.setStatus(domain, store.SiteActive)
		return nil
	})
	if err != nil {
		_ = s.st.DeleteSite(domain)
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// Delete starts the async task that removes the site's config and state.
func (s *Service) Delete(rawDomain string) (store.Task, error) {
	site, err := s.Get(rawDomain)
	if err != nil {
		return store.Task{}, err
	}
	params := map[string]any{"domain": site.Domain}
	if err := s.audit.Append(audit.Record{Action: TaskDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	task, err := s.eng.Create(TaskDelete, site.Domain, func(ctx context.Context, log tasks.LogFunc) error {
		return s.deprovision(ctx, log, site)
	})
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// ApplyNginx renders the site's config, writes it (or its dry-run copy),
// tests the configuration and reloads nginx. It is also used by ssl.
func (s *Service) ApplyNginx(ctx context.Context, log tasks.LogFunc, site store.Site) error {
	confPath := s.confPath(site.Domain)
	if s.cfg.DryRun {
		if err := os.MkdirAll(filepath.Dir(confPath), 0o755); err != nil {
			return fmt.Errorf("create dry-run dir: %w", err)
		}
	} else if err := os.MkdirAll(s.cfg.LogDir, 0o755); err != nil {
		return fmt.Errorf("create log dir %s: %w", s.cfg.LogDir, err)
	}

	previous, readErr := os.ReadFile(confPath)
	hadPrevious := readErr == nil

	if err := os.WriteFile(confPath, []byte(RenderNginxConfig(site, s.cfg.LogDir, s.fpmSockFor(site.PHPVersion))), 0o644); err != nil {
		return fmt.Errorf("write nginx config %s: %w", confPath, err)
	}
	log("info", "wrote nginx config "+confPath)
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "nginx", "-t"); err != nil {
		if !s.cfg.DryRun {
			s.rollbackConfig(confPath, previous, hadPrevious, log)
		}
		return fmt.Errorf("nginx configuration test failed: %w", err)
	}
	return s.reload(ctx, log)
}

// rollbackConfig restores the previous config after a failed nginx test, or
// removes the fresh config if none existed. A failed change must never leave
// a broken config behind for the server's nginx to trip over later.
func (s *Service) rollbackConfig(confPath string, previous []byte, hadPrevious bool, log tasks.LogFunc) {
	if hadPrevious {
		if err := os.WriteFile(confPath, previous, 0o644); err != nil {
			log("error", fmt.Sprintf("rollback: restore %s: %v", confPath, err))
			return
		}
		log("warn", "restored previous nginx config after failed test: "+confPath)
		return
	}
	if err := os.Remove(confPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		log("error", fmt.Sprintf("rollback: remove %s: %v", confPath, err))
		return
	}
	log("warn", "removed nginx config after failed test: "+confPath)
}

// Reconcile marks sites whose nginx config is missing as error. It runs once
// at startup and is skipped in dry-run mode.
func (s *Service) Reconcile() {
	for _, site := range s.st.ListSites() {
		if _, err := os.Stat(s.confPath(site.Domain)); os.IsNotExist(err) {
			stdlog.Printf("reconcile: nginx config missing for %s, marking site error", site.Domain)
			s.setStatus(site.Domain, store.SiteError)
		}
	}
}

func (s *Service) provision(ctx context.Context, log tasks.LogFunc, site store.Site) error {
	log("info", "creating webroot "+site.Root)
	if s.cfg.DryRun {
		log("info", "dry-run: skipping webroot creation")
	} else if err := ensureWebroot(site.Root, site.Domain, log); err != nil {
		return err
	}
	if err := s.ApplyNginx(ctx, log, site); err != nil {
		return err
	}
	log("info", fmt.Sprintf("site %s is active", site.Domain))
	return nil
}

func (s *Service) deprovision(ctx context.Context, log tasks.LogFunc, site store.Site) error {
	confPath := s.confPath(site.Domain)
	switch err := os.Remove(confPath); {
	case err == nil:
		log("info", "removed nginx config "+confPath)
	case errors.Is(err, os.ErrNotExist):
		log("warn", "nginx config not found, continuing")
	default:
		return fmt.Errorf("remove nginx config %s: %w", confPath, err)
	}
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "nginx", "-t"); err != nil {
		return fmt.Errorf("nginx configuration test failed: %w", err)
	}
	if err := s.reload(ctx, log); err != nil {
		return err
	}
	if !s.cfg.DryRun {
		cronPath := s.cronFragmentPath(site.Domain)
		switch err := os.Remove(cronPath); {
		case err == nil:
			log("info", "removed cron fragment "+cronPath)
		case errors.Is(err, os.ErrNotExist):
			// no cron fragment for this site
		default:
			return fmt.Errorf("remove cron fragment %s: %w", cronPath, err)
		}
	}
	if err := s.st.DeleteSite(site.Domain); err != nil {
		return fmt.Errorf("remove site from state: %w", err)
	}
	log("info", "site removed from state")
	log("info", "webroot kept on disk: "+site.Root)
	return nil
}

// reload asks systemd first and falls back to the nginx binary.
func (s *Service) reload(ctx context.Context, log tasks.LogFunc) error {
	log("info", "reloading nginx")
	err := safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "reload", "nginx")
	if err == nil {
		return nil
	}
	log("warn", fmt.Sprintf("systemctl reload nginx failed (%v), trying nginx -s reload", err))
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "nginx", "-s", "reload"); err != nil {
		return fmt.Errorf("reload nginx: %w", err)
	}
	return nil
}

func (s *Service) rootFor(domain string) string {
	return path.Join(s.cfg.Webroot, domain)
}

func (s *Service) confPath(domain string) string {
	if s.cfg.DryRun {
		return filepath.Join(s.cfg.StateDir, "dryrun", domain+".conf")
	}
	return path.Join(s.cfg.NginxSitesDir, domain+".conf")
}

func (s *Service) setStatus(domain, status string) {
	err := s.st.UpdateSite(domain, func(site *store.Site) {
		site.Status = status
		site.UpdatedAt = store.Now()
	})
	if err != nil {
		stdlog.Printf("sites: update %s status to %s: %v", domain, status, err)
	}
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("sites: write audit log: %v", auditErr)
	}
	return err
}

func ensureWebroot(root, domain string, log tasks.LogFunc) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create webroot %s: %w", root, err)
	}
	index := filepath.Join(root, "index.html")
	if _, err := os.Stat(index); err == nil {
		log("info", "index.html already exists, kept")
		return nil
	}
	content := fmt.Sprintf("CloudDeck placeholder — %s\n", domain)
	if err := os.WriteFile(index, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write placeholder index.html: %w", err)
	}
	log("info", "wrote placeholder index.html")
	return nil
}
