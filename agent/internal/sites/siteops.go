// This file is the v0.4 site-operations seam: subdomains, redirects, cron
// jobs, PHP version switching and per-site IP blocking. Signatures and JSON
// shapes are frozen in docs/api.md section 1.7.
package sites

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	stdlog "log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/php"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// Task types owned by the site-operation flows.
const (
	TaskSubdomainCreate = "site.subdomain.create"
	TaskSubdomainDelete = "site.subdomain.delete"
)

// Audit actions owned by the synchronous site-operation flows.
const (
	ActionRedirectAdd    = "site.redirect.add"
	ActionRedirectDelete = "site.redirect.delete"
	ActionCronAdd        = "site.cron.add"
	ActionCronDelete     = "site.cron.delete"
	ActionPHPSet         = "site.php.set"
	ActionIPBlock        = "site.ip.block"
	ActionIPUnblock      = "site.ip.unblock"
)

// Validation limits from docs/api.md section 1.7.
const (
	maxRedirectFrom = 512
	maxRedirectTo   = 2048
	maxCronCommand  = 1024
	maxCronComment  = 200
)

var (
	// subdomainRe is the frozen subdomain label regex.
	subdomainRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
	// cronFieldRe is the frozen cron schedule field regex.
	cronFieldRe = regexp.MustCompile(`^[0-9*/,\-]{1,20}$`)
)

// dryRunErr is the frozen reply of every mutation in dry-run mode.
func (s *Service) dryRunErr() error {
	return apierr.Conflict("dry_run", "site operations are disabled in dry-run mode")
}

// logToStd logs nginx render output for the synchronous operations, which have
// no task record to attach log lines to.
func logToStd(level, message string) {
	stdlog.Printf("sites: [%s] %s", level, message)
}

// nonNil keeps list JSON bodies as [] instead of null.
func nonNil[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}

// newOpID returns an 8 lowercase hex character identifier.
func newOpID() string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%08x", uint64(time.Now().UnixNano())&0xffffffff)
	}
	return hex.EncodeToString(buf)
}

// revertSite re-applies a mutation snapshot after a failed render. It is best
// effort: a revert failure is logged, not surfaced to the caller.
func (s *Service) revertSite(domain string, restore func(*store.Site)) {
	if err := s.st.UpdateSite(domain, func(site *store.Site) {
		restore(site)
		site.UpdatedAt = store.Now()
	}); err != nil {
		stdlog.Printf("sites: revert %s after failed render: %v", domain, err)
	}
}

// renderFailure rolls a failed synchronous mutation back: the store change is
// reverted, the previous config is re-applied best effort, and the render
// error is returned as a 500.
func (s *Service) renderFailure(ctx context.Context, domain string, restore func(*store.Site), err error) error {
	s.revertSite(domain, restore)
	if prev, ok := s.st.GetSite(domain); ok {
		if applyErr := s.ApplyNginx(ctx, logToStd, prev); applyErr != nil {
			stdlog.Printf("sites: re-render previous config for %s: %v", domain, applyErr)
		}
	}
	return apierr.Internal(fmt.Sprintf("apply nginx config: %v", err))
}

// fpmSockFor resolves the php-fpm socket for version: an exact match in
// AGENT_PHP_SOCK_MAP wins, otherwise AGENT_PHP_FPM_SOCK with `{{version}}`
// substituted.
func (s *Service) fpmSockFor(version string) string {
	for _, entry := range strings.Split(s.cfg.PHPSockMap, ",") {
		versionPart, sock, ok := strings.Cut(entry, "=")
		sock = strings.TrimSpace(sock)
		if !ok || sock == "" {
			continue
		}
		if strings.TrimSpace(versionPart) == version {
			return sock
		}
	}
	return strings.ReplaceAll(s.cfg.PHPFpmSock, "{{version}}", version)
}

// ---- subdomains (task-backed) ----

// ListSubdomains returns a site's subdomains.
func (s *Service) ListSubdomains(domain string) ([]store.Subdomain, error) {
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	return nonNil(site.Subdomains), nil
}

// validSubdomainName checks the frozen label rules: lowercase
// `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` and never "www".
func validSubdomainName(name string) bool {
	return name != "www" && subdomainRe.MatchString(name)
}

// CreateSubdomain adds one subdomain (task-backed: vhost block + webroot).
func (s *Service) CreateSubdomain(domain, name string) (store.Task, error) {
	if s.cfg.DryRun {
		return store.Task{}, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return store.Task{}, err
	}
	params := map[string]any{"domain": site.Domain, "name": name}
	if !validSubdomainName(name) {
		return store.Task{}, s.reject(TaskSubdomainCreate, params, apierr.BadRequest("invalid_subdomain", fmt.Sprintf("invalid subdomain name %q", name)))
	}
	for _, sub := range site.Subdomains {
		if sub.Name == name {
			return store.Task{}, s.reject(TaskSubdomainCreate, params, apierr.Conflict("subdomain_exists", fmt.Sprintf("subdomain %q already exists for %s", name, site.Domain)))
		}
	}
	if err := s.audit.Append(audit.Record{Action: TaskSubdomainCreate, Params: params, Result: audit.ResultAccepted}); err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.Subdomain(nil), site.Subdomains...)
	subRoot := filepath.Join(site.Root, name)
	task, err := s.eng.Create(TaskSubdomainCreate, site.Domain, func(ctx context.Context, log tasks.LogFunc) error {
		log("info", "creating subdomain webroot "+subRoot)
		if err := ensureWebroot(subRoot, name+"."+site.Domain, log); err != nil {
			return err
		}
		if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
			current.Subdomains = append(current.Subdomains, store.Subdomain{Name: name, CreatedAt: store.Now()})
			current.UpdatedAt = store.Now()
		}); err != nil {
			return fmt.Errorf("persist subdomain: %w", err)
		}
		updated, ok := s.st.GetSite(site.Domain)
		if !ok {
			return fmt.Errorf("site %s vanished from state", site.Domain)
		}
		if err := s.ApplyNginx(ctx, log, updated); err != nil {
			s.revertSite(site.Domain, func(current *store.Site) { current.Subdomains = previous })
			return fmt.Errorf("apply nginx config: %w", err)
		}
		return nil
	})
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// DeleteSubdomain removes one subdomain (task-backed).
func (s *Service) DeleteSubdomain(domain, name string) (store.Task, error) {
	if s.cfg.DryRun {
		return store.Task{}, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return store.Task{}, err
	}
	params := map[string]any{"domain": site.Domain, "name": name}
	idx := -1
	for i, sub := range site.Subdomains {
		if sub.Name == name {
			idx = i
			break
		}
	}
	if idx < 0 {
		return store.Task{}, s.reject(TaskSubdomainDelete, params, apierr.NotFound("subdomain_not_found", fmt.Sprintf("subdomain %q does not exist for %s", name, site.Domain)))
	}
	if err := s.audit.Append(audit.Record{Action: TaskSubdomainDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.Subdomain(nil), site.Subdomains...)
	task, err := s.eng.Create(TaskSubdomainDelete, site.Domain, func(ctx context.Context, log tasks.LogFunc) error {
		if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
			kept := current.Subdomains[:0]
			for _, sub := range current.Subdomains {
				if sub.Name != name {
					kept = append(kept, sub)
				}
			}
			current.Subdomains = kept
			current.UpdatedAt = store.Now()
		}); err != nil {
			return fmt.Errorf("persist subdomain removal: %w", err)
		}
		updated, ok := s.st.GetSite(site.Domain)
		if !ok {
			return fmt.Errorf("site %s vanished from state", site.Domain)
		}
		if err := s.ApplyNginx(ctx, log, updated); err != nil {
			s.revertSite(site.Domain, func(current *store.Site) { current.Subdomains = previous })
			return fmt.Errorf("apply nginx config: %w", err)
		}
		log("info", "subdomain webroot kept on disk: "+filepath.Join(site.Root, name))
		return nil
	})
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// ---- redirects (synchronous, audited) ----

// validateRedirect enforces the frozen redirect rules.
func validateRedirect(from, to string) error {
	if !strings.HasPrefix(from, "/") || len(from) > maxRedirectFrom {
		return apierr.BadRequest("invalid_redirect", fmt.Sprintf("redirect \"from\" must start with \"/\" and be 1-%d characters", maxRedirectFrom))
	}
	for _, r := range from {
		if unicode.IsSpace(r) || strings.ContainsRune("\"';{}", r) {
			return apierr.BadRequest("invalid_redirect", "redirect \"from\" must not contain whitespace, quotes or ;{}")
		}
	}
	if len(to) == 0 || len(to) > maxRedirectTo {
		return apierr.BadRequest("invalid_redirect", fmt.Sprintf("redirect \"to\" is required and must be at most %d characters", maxRedirectTo))
	}
	u, err := url.Parse(to)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return apierr.BadRequest("invalid_redirect", "redirect \"to\" must be an absolute http(s) URL")
	}
	return nil
}

// ListRedirects returns a site's redirect rules.
func (s *Service) ListRedirects(domain string) ([]store.Redirect, error) {
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	return nonNil(site.Redirects), nil
}

// AddRedirect persists one redirect rule, re-renders the vhost and returns
// the updated list.
func (s *Service) AddRedirect(domain, from, to string, permanent bool) ([]store.Redirect, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"domain": site.Domain, "from": from, "to": to, "permanent": permanent}
	if err := validateRedirect(from, to); err != nil {
		return nil, s.reject(ActionRedirectAdd, params, err)
	}
	id := newOpID()
	params["id"] = id
	if err := s.audit.Append(audit.Record{Action: ActionRedirectAdd, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.Redirect(nil), site.Redirects...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.Redirects = append(current.Redirects, store.Redirect{ID: id, From: from, To: to, Permanent: permanent})
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist redirect: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return nil, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.Redirects = previous }, err)
	}
	return nonNil(updated.Redirects), nil
}

// DeleteRedirect removes one redirect rule by id and returns the updated list.
func (s *Service) DeleteRedirect(domain, id string) ([]store.Redirect, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"domain": site.Domain, "id": id}
	idx := -1
	for i, r := range site.Redirects {
		if r.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, s.reject(ActionRedirectDelete, params, apierr.NotFound("redirect_not_found", fmt.Sprintf("redirect %q does not exist", id)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionRedirectDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.Redirect(nil), site.Redirects...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		kept := current.Redirects[:0]
		for _, r := range current.Redirects {
			if r.ID != id {
				kept = append(kept, r)
			}
		}
		current.Redirects = kept
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist redirect removal: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return nil, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.Redirects = previous }, err)
	}
	return nonNil(updated.Redirects), nil
}

// ---- cron (synchronous, audited) ----

// validateCron enforces the frozen cron rules: exactly five fields matching
// `^[0-9*/,\-]{1,20}$`, a 1-1024 character newline-free command and an
// optional comment of at most 200 characters.
func validateCron(schedule, command, comment string) error {
	fields := strings.Fields(schedule)
	if len(fields) != 5 {
		return apierr.BadRequest("invalid_cron", "schedule must be exactly 5 whitespace-separated fields")
	}
	for _, field := range fields {
		if !cronFieldRe.MatchString(field) {
			return apierr.BadRequest("invalid_cron", fmt.Sprintf("invalid schedule field %q", field))
		}
	}
	if len(command) < 1 || len(command) > maxCronCommand {
		return apierr.BadRequest("invalid_cron", fmt.Sprintf("command must be 1-%d characters", maxCronCommand))
	}
	if strings.ContainsAny(command, "\n\r") {
		return apierr.BadRequest("invalid_cron", "command must not contain newlines")
	}
	if len(comment) > maxCronComment {
		return apierr.BadRequest("invalid_cron", fmt.Sprintf("comment must be at most %d characters", maxCronComment))
	}
	if strings.ContainsAny(comment, "\n\r") {
		return apierr.BadRequest("invalid_cron", "comment must not contain newlines")
	}
	return nil
}

// cronFragmentPath is the /etc/cron.d fragment owned by the site.
func (s *Service) cronFragmentPath(domain string) string {
	return filepath.Join(s.cfg.CronDir, "clouddeck-"+strings.ReplaceAll(domain, ".", "-"))
}

// writeCronFragment atomically rewrites the site's cron fragment: a header
// comment plus one `<schedule> root <command>` line per job.
func (s *Service) writeCronFragment(domain string, jobs []store.CronJob) error {
	if err := os.MkdirAll(s.cfg.CronDir, 0o755); err != nil {
		return fmt.Errorf("create cron dir %s: %w", s.cfg.CronDir, err)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# managed-by: clouddeck (site %s)\n", domain)
	for _, job := range jobs {
		fmt.Fprintf(&b, "%s root %s\n", job.Schedule, job.Command)
	}
	return writeFileAtomic(s.cronFragmentPath(domain), []byte(b.String()), 0o644)
}

// writeFileAtomic writes path via a temporary file and rename.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

// ListCron returns a site's cron jobs.
func (s *Service) ListCron(domain string) ([]store.CronJob, error) {
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	return nonNil(site.Cron), nil
}

// AddCron persists one cron job and rewrites the site's /etc/cron.d fragment.
func (s *Service) AddCron(domain, schedule, command, comment string) ([]store.CronJob, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"domain": site.Domain, "schedule": schedule, "command": command, "comment": comment}
	if err := validateCron(schedule, command, comment); err != nil {
		return nil, s.reject(ActionCronAdd, params, err)
	}
	id := newOpID()
	params["id"] = id
	if err := s.audit.Append(audit.Record{Action: ActionCronAdd, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.CronJob(nil), site.Cron...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.Cron = append(current.Cron, store.CronJob{ID: id, Schedule: schedule, Command: command, Comment: comment, CreatedAt: store.Now()})
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist cron job: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.writeCronFragment(site.Domain, updated.Cron); err != nil {
		s.revertSite(site.Domain, func(current *store.Site) { current.Cron = previous })
		return nil, apierr.Internal(fmt.Sprintf("write cron fragment: %v", err))
	}
	return nonNil(updated.Cron), nil
}

// DeleteCron removes one cron job by id and rewrites the fragment.
func (s *Service) DeleteCron(domain, id string) ([]store.CronJob, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	params := map[string]any{"domain": site.Domain, "id": id}
	idx := -1
	for i, job := range site.Cron {
		if job.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, s.reject(ActionCronDelete, params, apierr.NotFound("cron_not_found", fmt.Sprintf("cron job %q does not exist", id)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionCronDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.CronJob(nil), site.Cron...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		kept := current.Cron[:0]
		for _, job := range current.Cron {
			if job.ID != id {
				kept = append(kept, job)
			}
		}
		current.Cron = kept
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist cron removal: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.writeCronFragment(site.Domain, updated.Cron); err != nil {
		s.revertSite(site.Domain, func(current *store.Site) { current.Cron = previous })
		return nil, apierr.Internal(fmt.Sprintf("write cron fragment: %v", err))
	}
	return nonNil(updated.Cron), nil
}

// ---- PHP version switching (synchronous, audited) ----

// SetPHPVersion switches the site's PHP version, re-rendering the vhost with
// that version's FPM socket.
func (s *Service) SetPHPVersion(domain, version string) (store.Site, error) {
	if s.cfg.DryRun {
		return store.Site{}, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return store.Site{}, err
	}
	version = strings.TrimSpace(version)
	params := map[string]any{"domain": site.Domain, "version": version}
	if !php.Offered(s.cfg.PHPBase, version) {
		return store.Site{}, s.reject(ActionPHPSet, params, apierr.BadRequest("invalid_php_version", fmt.Sprintf("PHP version %q is not offered by this server", version)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionPHPSet, Params: params, Result: audit.ResultAccepted}); err != nil {
		return store.Site{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := site.PHPVersion
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.PHPVersion = version
		current.UpdatedAt = store.Now()
	}); err != nil {
		return store.Site{}, apierr.Internal(fmt.Sprintf("persist PHP version: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return store.Site{}, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return store.Site{}, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.PHPVersion = previous }, err)
	}
	return updated, nil
}

// ---- IP blocking (synchronous, audited) ----

// ListBlockedIPs returns the site's blocked-IP list.
func (s *Service) ListBlockedIPs(domain string) ([]store.BlockedIP, error) {
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	return nonNil(site.BlockedIPs), nil
}

// BlockIP adds one IP to the site's deny list and re-renders the vhost.
func (s *Service) BlockIP(domain, ip, note string) ([]store.BlockedIP, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	parsed := net.ParseIP(strings.TrimSpace(ip))
	params := map[string]any{"domain": site.Domain, "ip": ip, "note": note}
	if parsed == nil {
		return nil, s.reject(ActionIPBlock, params, apierr.BadRequest("invalid_ip", fmt.Sprintf("invalid IP address %q", ip)))
	}
	normalized := parsed.String()
	params["ip"] = normalized
	for _, blocked := range site.BlockedIPs {
		if blocked.IP == normalized {
			return nil, s.reject(ActionIPBlock, params, apierr.Conflict("ip_exists", fmt.Sprintf("IP %s is already blocked for %s", normalized, site.Domain)))
		}
	}
	if err := s.audit.Append(audit.Record{Action: ActionIPBlock, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.BlockedIP(nil), site.BlockedIPs...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.BlockedIPs = append(current.BlockedIPs, store.BlockedIP{IP: normalized, Note: note, CreatedAt: store.Now()})
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist blocked IP: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return nil, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.BlockedIPs = previous }, err)
	}
	return nonNil(updated.BlockedIPs), nil
}

// UnblockIP removes one IP from the site's deny list.
func (s *Service) UnblockIP(domain, ip string) ([]store.BlockedIP, error) {
	if s.cfg.DryRun {
		return nil, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	parsed := net.ParseIP(strings.TrimSpace(ip))
	params := map[string]any{"domain": site.Domain, "ip": ip}
	if parsed == nil {
		return nil, s.reject(ActionIPUnblock, params, apierr.BadRequest("invalid_ip", fmt.Sprintf("invalid IP address %q", ip)))
	}
	normalized := parsed.String()
	params["ip"] = normalized
	idx := -1
	for i, blocked := range site.BlockedIPs {
		if blocked.IP == normalized {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, s.reject(ActionIPUnblock, params, apierr.NotFound("ip_not_found", fmt.Sprintf("IP %s is not blocked for %s", normalized, site.Domain)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionIPUnblock, Params: params, Result: audit.ResultAccepted}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := append([]store.BlockedIP(nil), site.BlockedIPs...)
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		kept := current.BlockedIPs[:0]
		for _, blocked := range current.BlockedIPs {
			if blocked.IP != normalized {
				kept = append(kept, blocked)
			}
		}
		current.BlockedIPs = kept
		current.UpdatedAt = store.Now()
	}); err != nil {
		return nil, apierr.Internal(fmt.Sprintf("persist unblocked IP: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return nil, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return nil, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.BlockedIPs = previous }, err)
	}
	return nonNil(updated.BlockedIPs), nil
}
