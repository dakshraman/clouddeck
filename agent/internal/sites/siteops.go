// This file is the v0.4 site-operations seam: subdomains, redirects, cron
// jobs, PHP version switching and per-site IP blocking. Signatures and JSON
// shapes are frozen in docs/api.md section 1.7.
package sites

import (
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/store"
)

// Task types owned by the site-operation flows.
const (
	TaskSubdomainCreate = "site.subdomain.create"
	TaskSubdomainDelete = "site.subdomain.delete"
)

// ListSubdomains returns a site's subdomains.
func (s *Service) ListSubdomains(domain string) ([]store.Subdomain, error) {
	return nil, apierr.Internal("sites: ListSubdomains not implemented")
}

// CreateSubdomain adds one subdomain (task-backed: vhost block + webroot).
func (s *Service) CreateSubdomain(domain, name string) (store.Task, error) {
	return store.Task{}, apierr.Internal("sites: CreateSubdomain not implemented")
}

// DeleteSubdomain removes one subdomain (task-backed).
func (s *Service) DeleteSubdomain(domain, name string) (store.Task, error) {
	return store.Task{}, apierr.Internal("sites: DeleteSubdomain not implemented")
}

// ListRedirects returns a site's redirect rules.
func (s *Service) ListRedirects(domain string) ([]store.Redirect, error) {
	return nil, apierr.Internal("sites: ListRedirects not implemented")
}

// AddRedirect persists one redirect rule, re-renders the vhost and returns
// the updated list.
func (s *Service) AddRedirect(domain, from, to string, permanent bool) ([]store.Redirect, error) {
	return nil, apierr.Internal("sites: AddRedirect not implemented")
}

// DeleteRedirect removes one redirect rule by id and returns the updated list.
func (s *Service) DeleteRedirect(domain, id string) ([]store.Redirect, error) {
	return nil, apierr.Internal("sites: DeleteRedirect not implemented")
}

// ListCron returns a site's cron jobs.
func (s *Service) ListCron(domain string) ([]store.CronJob, error) {
	return nil, apierr.Internal("sites: ListCron not implemented")
}

// AddCron persists one cron job and rewrites the site's /etc/cron.d fragment.
func (s *Service) AddCron(domain, schedule, command, comment string) ([]store.CronJob, error) {
	return nil, apierr.Internal("sites: AddCron not implemented")
}

// DeleteCron removes one cron job by id and rewrites the fragment.
func (s *Service) DeleteCron(domain, id string) ([]store.CronJob, error) {
	return nil, apierr.Internal("sites: DeleteCron not implemented")
}

// ListBlockedIPs returns the site's blocked-IP list.
func (s *Service) ListBlockedIPs(domain string) ([]store.BlockedIP, error) {
	return nil, apierr.Internal("sites: ListBlockedIPs not implemented")
}

// BlockIP adds one IP to the site's deny list and re-renders the vhost.
func (s *Service) BlockIP(domain, ip, note string) ([]store.BlockedIP, error) {
	return nil, apierr.Internal("sites: BlockIP not implemented")
}

// UnblockIP removes one IP from the site's deny list.
func (s *Service) UnblockIP(domain, ip string) ([]store.BlockedIP, error) {
	return nil, apierr.Internal("sites: UnblockIP not implemented")
}

// SetPHPVersion switches the site's PHP version, re-rendering the vhost with
// that version's FPM socket.
func (s *Service) SetPHPVersion(domain, version string) (store.Site, error) {
	return store.Site{}, apierr.Internal("sites: SetPHPVersion not implemented")
}
