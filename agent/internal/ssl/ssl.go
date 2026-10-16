// Package ssl issues Let's Encrypt certificates through certbot and switches
// the site's nginx config to HTTPS.
package ssl

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	stdlog "log"
	"os"
	"os/exec"
	"path"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// TaskType is the task type recorded for certificate issuance.
const TaskType = "ssl.issue"

const letsEncryptLive = "/etc/letsencrypt/live"

// Issuer schedules certificate issuance for a site.
type Issuer struct {
	st    *store.Store
	sites *sites.Service
	eng   *tasks.Engine
	audit *audit.Log
	cfg   config.Config
}

// New creates the SSL issuer.
func New(st *store.Store, siteSvc *sites.Service, eng *tasks.Engine, auditLog *audit.Log, cfg config.Config) *Issuer {
	return &Issuer{st: st, sites: siteSvc, eng: eng, audit: auditLog, cfg: cfg}
}

// Issue starts the async task that requests a certificate for the site.
func (s *Issuer) Issue(rawDomain, email string) (store.Task, error) {
	domain, err := sites.ValidateDomain(rawDomain)
	if err != nil {
		return store.Task{}, err
	}
	email = strings.TrimSpace(email)
	if !validEmail(email) {
		return store.Task{}, apierr.BadRequest("invalid_email", fmt.Sprintf("invalid email %q", email))
	}
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.Task{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}
	if site.SSL.Enabled {
		return store.Task{}, s.reject(domain, email, apierr.Conflict("ssl_already_enabled", fmt.Sprintf("SSL is already enabled for %q", domain)))
	}
	if err := s.audit.Append(audit.Record{
		Action: TaskType,
		Params: map[string]any{"domain": domain, "email": email},
		Result: audit.ResultAccepted,
	}); err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	task, err := s.eng.Create(TaskType, domain, func(ctx context.Context, log tasks.LogFunc) error {
		return s.issue(ctx, log, site, email)
	})
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

func (s *Issuer) issue(ctx context.Context, log tasks.LogFunc, site store.Site, email string) error {
	if s.cfg.DryRun {
		log("info", "dry-run: skipping certbot; pretending the certificate was issued")
	} else {
		if _, err := exec.LookPath("certbot"); err != nil {
			return errors.New("certbot is not installed on this server")
		}
		log("info", fmt.Sprintf("requesting certificate for %s and www.%s", site.Domain, site.Domain))
		err := safeexec.Run(ctx, false, log, "certbot", "certonly", "--webroot",
			"-w", site.Root,
			"-d", site.Domain,
			"-d", "www."+site.Domain,
			"--non-interactive", "--agree-tos",
			"-m", email,
		)
		if err != nil {
			return fmt.Errorf("certbot failed for %s: %w", site.Domain, err)
		}
	}

	site.SSL = store.SSL{Enabled: true, Issuer: "Let's Encrypt", ExpiresAt: certExpiry(site.Domain)}
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.SSL = site.SSL
		current.UpdatedAt = store.Now()
	}); err != nil {
		return fmt.Errorf("persist certificate state: %w", err)
	}
	if site.SSL.ExpiresAt != "" {
		log("info", "certificate expires "+site.SSL.ExpiresAt)
	}
	log("info", "updating nginx configuration for HTTPS")
	return s.sites.ApplyNginx(ctx, log, site)
}

// certExpiry reads the issued certificate's NotAfter; it is best effort and
// returns "" when the file is unreadable.
func certExpiry(domain string) string {
	data, err := os.ReadFile(path.Join(letsEncryptLive, domain, "cert.pem"))
	if err != nil {
		return ""
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return ""
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return ""
	}
	return cert.NotAfter.UTC().Format(time.RFC3339)
}

func (s *Issuer) reject(domain, email string, err error) error {
	if auditErr := s.audit.Append(audit.Record{
		Action: TaskType,
		Params: map[string]any{"domain": domain, "email": email},
		Result: audit.ResultRejected,
		Error:  err.Error(),
	}); auditErr != nil {
		stdlog.Printf("ssl: write audit log: %v", auditErr)
	}
	return err
}

// validEmail is a rudimentary check: one "@", no spaces, a dot in the domain.
func validEmail(email string) bool {
	if strings.ContainsAny(email, " \t") {
		return false
	}
	local, domain, found := strings.Cut(email, "@")
	if !found || local == "" || domain == "" {
		return false
	}
	dot := strings.LastIndex(domain, ".")
	return dot > 0 && dot < len(domain)-1
}
