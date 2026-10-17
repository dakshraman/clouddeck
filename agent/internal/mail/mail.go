// Package mail manages virtual mail domains, mailboxes, forwarders,
// autoresponders and DKIM/DNS records behind the /v1/mail endpoints. State
// is file-backed so it works with whatever MTA/Dovecot layout the host uses
// (see docs/api.md section 1.6 for the frozen file layouts).
package mail

import (
	"context"
	"fmt"
	stdlog "log"
	"os"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/dns"
	"clouddeck/agent/internal/safeexec"
)

// Service coordinates mail state and DNS helpers.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	dns   *dns.Manager

	// mu serializes the read-modify-write cycles on the shared mail files.
	// Reads rely on the atomic temp-file + rename writes instead.
	mu sync.Mutex
}

// New creates the mail service.
func New(cfg config.Config, auditLog *audit.Log, dnsMgr *dns.Manager) *Service {
	return &Service{cfg: cfg, audit: auditLog, dns: dnsMgr}
}

// Status is the GET /v1/mail/status body.
type Status struct {
	BaseDir     string `json:"baseDir"`
	Hostname    string `json:"hostname"`
	Domains     int    `json:"domains"`
	Accounts    int    `json:"accounts"`
	DKIMEnabled int    `json:"dkimEnabled"`
}

// Account is one mailbox.
type Account struct {
	Email     string    `json:"email"`
	Domain    string    `json:"domain"`
	QuotaMB   int64     `json:"quotaMb"`
	Bytes     int64     `json:"bytes"`
	CreatedAt time.Time `json:"createdAt"`
}

// Forwarder is one alias entry (source -> comma-separated targets).
type Forwarder struct {
	Source    string    `json:"source"`
	Target    string    `json:"target"`
	CreatedAt time.Time `json:"createdAt"`
}

// Autoresponder is a per-address vacation reply.
type Autoresponder struct {
	Email     string    `json:"email"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
	Enabled   bool      `json:"enabled"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// DKIMInfo describes one domain's DKIM state.
type DKIMInfo struct {
	Domain     string `json:"domain"`
	Selector   string `json:"selector"`
	Enabled    bool   `json:"enabled"`
	DNSName    string `json:"dnsName,omitempty"`
	DNSRecord  string `json:"dnsRecord,omitempty"`
	DNSApplied bool   `json:"dnsApplied"`
}

// DNSOptions selects which records POST /v1/mail/dns/{domain} applies.
type DNSOptions struct {
	SPF         bool   `json:"spf"`
	DMARCPolicy string `json:"dmarcPolicy"`
	DKIM        bool   `json:"dkim"`
	MX          bool   `json:"mx"`
}

// DNSResult reports the records that were published.
type DNSResult struct {
	Applied map[string]string `json:"applied"`
	Errors  []string          `json:"errors,omitempty"`
}

// Status returns the mail overview counts. It never fails: unreadable files
// and directories count as zero.
func (s *Service) Status() Status {
	status := Status{BaseDir: s.cfg.MailRoot, Hostname: s.cfg.MailHostname}
	if domains, err := s.readDomains(); err == nil {
		status.Domains = len(domains)
	}
	if lines, err := readLines(s.cfg.MailUsersFile); err == nil {
		for _, line := range lines {
			if _, ok := parsePasswdLine(line); ok {
				status.Accounts++
			}
		}
	}
	if entries, err := os.ReadDir(s.cfg.MailDkimDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".key") {
				status.DKIMEnabled++
			}
		}
	}
	return status
}

// dryRunErr is the frozen reply of every mail mutation in dry-run mode.
func dryRunErr() error {
	return apierr.Conflict("dry_run", "mail operations are disabled in dry-run mode")
}

// record appends the accepted audit entry for a mutation. When the write
// fails the mutation itself is already applied to disk, so that is logged
// loudly and surfaced as a 500.
func (s *Service) record(action string, params map[string]any) error {
	if err := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}); err != nil {
		stdlog.Printf("mail: WARNING: %s %v already applied on disk but writing the audit log failed: %v", action, params, err)
		return apierr.Internal(fmt.Sprintf("write audit log: %v (the change may already be applied)", err))
	}
	return nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("mail: write audit log: %v", auditErr)
	}
	return err
}

// reload runs AGENT_MAIL_RELOAD_CMD after mutations that change the domains,
// users or aliases files. The command is split on whitespace and executed
// without a shell; failures are logged, never returned, because the on-disk
// state is already consistent.
func (s *Service) reload() {
	argv := strings.Fields(s.cfg.MailReloadCmd)
	if len(argv) == 0 {
		return
	}
	if err := safeexec.Run(context.Background(), s.cfg.DryRun, s.logf, argv[0], argv[1:]...); err != nil {
		stdlog.Printf("mail: reload command failed: %v", err)
	}
}

// logf adapts the agent's log output to safeexec.Logger.
func (s *Service) logf(level, message string) {
	stdlog.Printf("mail: %s: %s", level, message)
}

// containsString reports whether values contain value.
func containsString(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
