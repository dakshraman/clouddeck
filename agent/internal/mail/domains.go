package mail

import (
	"errors"
	"fmt"
	stdlog "log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/sites"
)

// Audit actions owned by the domain endpoints.
const (
	actionDomainCreate = "mail.domain.create"
	actionDomainDelete = "mail.domain.delete"
)

// ListDomains returns every mail domain, sorted.
func (s *Service) ListDomains() ([]string, error) {
	domains, err := s.readDomains()
	if err != nil {
		return nil, apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	return domains, nil
}

// readDomains loads the domains file, lowercases and de-duplicates the
// entries and sorts them. Blank lines and comments are skipped.
func (s *Service) readDomains() ([]string, error) {
	lines, err := readLines(s.cfg.MailDomainsFile)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(lines))
	domains := make([]string, 0, len(lines))
	for _, line := range lines {
		domain := strings.ToLower(strings.TrimSpace(line))
		if domain == "" || strings.HasPrefix(domain, "#") {
			continue
		}
		if _, dup := seen[domain]; dup {
			continue
		}
		seen[domain] = struct{}{}
		domains = append(domains, domain)
	}
	sort.Strings(domains)
	return domains, nil
}

// writeDomains replaces the domains file; it must be called with mu held.
func (s *Service) writeDomains(domains []string) error {
	if err := writeFileAtomic(s.cfg.MailDomainsFile, joinLines(domains), 0o644); err != nil {
		return apierr.Internal(fmt.Sprintf("write domains file: %v", err))
	}
	return nil
}

// AddDomain adds one mail domain.
func (s *Service) AddDomain(domain string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"domain": domain}
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		return s.reject(actionDomainCreate, params, err)
	}
	params["domain"] = normalized
	if err := s.addDomainFile(normalized); err != nil {
		return s.reject(actionDomainCreate, params, err)
	}
	if err := s.record(actionDomainCreate, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

func (s *Service) addDomainFile(domain string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	domains, err := s.readDomains()
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	if containsString(domains, domain) {
		return apierr.Conflict("mail_domain_exists", fmt.Sprintf("mail domain %q already exists", domain))
	}
	domains = append(domains, domain)
	sort.Strings(domains)
	return s.writeDomains(domains)
}

// DeleteDomain removes a mail domain plus its accounts, forwarders and
// autoresponders.
func (s *Service) DeleteDomain(domain string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"domain": domain}
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		return s.reject(actionDomainDelete, params, err)
	}
	params["domain"] = normalized
	if err := s.deleteDomainFiles(normalized); err != nil {
		return s.reject(actionDomainDelete, params, err)
	}
	if err := s.record(actionDomainDelete, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// deleteDomainFiles drops the domain entry and then, best effort, the
// domain's accounts, forwarders and autoresponders. Cleanup failures are
// logged and never abort the deletion. Maildirs are kept on disk, mirroring
// DeleteAccount.
func (s *Service) deleteDomainFiles(domain string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	domains, err := s.readDomains()
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	found := false
	kept := make([]string, 0, len(domains))
	for _, existing := range domains {
		if existing == domain {
			found = true
			continue
		}
		kept = append(kept, existing)
	}
	if !found {
		return apierr.NotFound("mail_domain_not_found", fmt.Sprintf("mail domain %q does not exist", domain))
	}
	if err := s.writeDomains(kept); err != nil {
		return err
	}
	s.removeDomainAccounts(domain)
	s.removeDomainForwarders(domain)
	s.removeDomainAutoresponders(domain)
	return nil
}

// removeDomainAccounts drops the domain's passwd-file entries, keeping
// non-entry lines and the maildirs. Best effort: failures are logged.
func (s *Service) removeDomainAccounts(domain string) {
	lines, err := readLines(s.cfg.MailUsersFile)
	if err != nil {
		stdlog.Printf("mail: delete domain %s: read users file: %v", domain, err)
		return
	}
	kept := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok && domainOf(strings.ToLower(entry.email())) == domain {
			removed = true
			continue
		}
		kept = append(kept, line)
	}
	if !removed {
		return
	}
	if err := writeFileAtomic(s.cfg.MailUsersFile, joinLines(kept), 0o600); err != nil {
		stdlog.Printf("mail: delete domain %s: rewrite users file: %v", domain, err)
	}
}

// removeDomainForwarders drops the domain's alias entries. Best effort.
func (s *Service) removeDomainForwarders(domain string) {
	lines, err := readLines(s.cfg.MailAliasesFile)
	if err != nil {
		stdlog.Printf("mail: delete domain %s: read aliases file: %v", domain, err)
		return
	}
	kept := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		if source, _, ok := parseAliasLine(line); ok && domainOf(source) == domain {
			removed = true
			continue
		}
		kept = append(kept, line)
	}
	if !removed {
		return
	}
	if err := writeFileAtomic(s.cfg.MailAliasesFile, joinLines(kept), 0o600); err != nil {
		stdlog.Printf("mail: delete domain %s: rewrite aliases file: %v", domain, err)
	}
}

// removeDomainAutoresponders removes the domain's sieve scripts and metadata
// files. Best effort.
func (s *Service) removeDomainAutoresponders(domain string) {
	entries, err := os.ReadDir(s.cfg.MailAutoreplyDir)
	if errors.Is(err, os.ErrNotExist) {
		return
	}
	if err != nil {
		stdlog.Printf("mail: delete domain %s: read autoreply dir: %v", domain, err)
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		var email string
		switch {
		case strings.HasSuffix(entry.Name(), ".sieve"):
			email = strings.TrimSuffix(entry.Name(), ".sieve")
		case strings.HasSuffix(entry.Name(), ".json"):
			email = strings.TrimSuffix(entry.Name(), ".json")
		default:
			continue
		}
		if domainOf(strings.ToLower(email)) != domain {
			continue
		}
		path := filepath.Join(s.cfg.MailAutoreplyDir, entry.Name())
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			stdlog.Printf("mail: delete domain %s: remove %s: %v", domain, entry.Name(), err)
		}
	}
}
