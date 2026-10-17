// Package mail manages virtual mail domains, mailboxes, forwarders,
// autoresponders and DKIM/DNS records behind the /v1/mail endpoints. State
// is file-backed so it works with whatever MTA/Dovecot layout the host uses
// (see docs/api.md section 1.6 for the frozen file layouts).
package mail

import (
	"context"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/dns"
)

// Service coordinates mail state and DNS helpers.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	dns   *dns.Manager
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

// Status returns the mail overview counts.
func (s *Service) Status() Status {
	return Status{}
}

// ListDomains returns every mail domain, sorted.
func (s *Service) ListDomains() ([]string, error) {
	return nil, apierr.Internal("mail: ListDomains not implemented")
}

// AddDomain adds one mail domain.
func (s *Service) AddDomain(domain string) error {
	return apierr.Internal("mail: AddDomain not implemented")
}

// DeleteDomain removes a mail domain plus its accounts, forwarders and
// autoresponders.
func (s *Service) DeleteDomain(domain string) error {
	return apierr.Internal("mail: DeleteDomain not implemented")
}

// ListAccounts lists mailboxes, optionally filtered by domain.
func (s *Service) ListAccounts(domain string) ([]Account, error) {
	return nil, apierr.Internal("mail: ListAccounts not implemented")
}

// CreateAccount creates a mailbox (passwd-file entry + maildir).
func (s *Service) CreateAccount(email, password string, quotaMB int64) (Account, error) {
	return Account{}, apierr.Internal("mail: CreateAccount not implemented")
}

// DeleteAccount removes a mailbox's passwd-file entry (maildir kept).
func (s *Service) DeleteAccount(email string) error {
	return apierr.Internal("mail: DeleteAccount not implemented")
}

// SetPassword rewrites one mailbox password entry.
func (s *Service) SetPassword(email, password string) error {
	return apierr.Internal("mail: SetPassword not implemented")
}

// SetQuota updates one mailbox quota.
func (s *Service) SetQuota(email string, quotaMB int64) error {
	return apierr.Internal("mail: SetQuota not implemented")
}

// ListForwarders lists aliases, optionally filtered by domain.
func (s *Service) ListForwarders(domain string) ([]Forwarder, error) {
	return nil, apierr.Internal("mail: ListForwarders not implemented")
}

// CreateForwarder adds one alias entry.
func (s *Service) CreateForwarder(source, target string) error {
	return apierr.Internal("mail: CreateForwarder not implemented")
}

// DeleteForwarder removes one alias entry.
func (s *Service) DeleteForwarder(source string) error {
	return apierr.Internal("mail: DeleteForwarder not implemented")
}

// GetAutoresponder returns one address's vacation reply.
func (s *Service) GetAutoresponder(email string) (Autoresponder, error) {
	return Autoresponder{}, apierr.Internal("mail: GetAutoresponder not implemented")
}

// SetAutoresponder upserts one address's vacation reply.
func (s *Service) SetAutoresponder(a Autoresponder) (Autoresponder, error) {
	return Autoresponder{}, apierr.Internal("mail: SetAutoresponder not implemented")
}

// DeleteAutoresponder removes one address's vacation reply.
func (s *Service) DeleteAutoresponder(email string) error {
	return apierr.Internal("mail: DeleteAutoresponder not implemented")
}

// DKIMStatus reports one domain's DKIM state.
func (s *Service) DKIMStatus(domain string) (DKIMInfo, error) {
	return DKIMInfo{}, apierr.Internal("mail: DKIMStatus not implemented")
}

// ApplyDNS generates/keeps the DKIM keypair and publishes the requested
// records (SPF, DMARC, DKIM, MX) into the domain's PowerDNS zone.
func (s *Service) ApplyDNS(ctx context.Context, domain string, opts DNSOptions) (DNSResult, error) {
	return DNSResult{}, apierr.Internal("mail: ApplyDNS not implemented")
}
