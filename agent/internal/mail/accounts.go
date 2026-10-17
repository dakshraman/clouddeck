package mail

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/sites"
)

// Audit actions owned by the account endpoints.
const (
	actionAccountCreate   = "mail.account.create"
	actionAccountDelete   = "mail.account.delete"
	actionAccountPassword = "mail.account.password"
	actionAccountQuota    = "mail.account.quota"
)

// ListAccounts lists mailboxes, optionally filtered by domain. Results are
// sorted by email.
func (s *Service) ListAccounts(domain string) ([]Account, error) {
	filter := ""
	if strings.TrimSpace(domain) != "" {
		normalized, err := sites.ValidateDomain(domain)
		if err != nil {
			return nil, err
		}
		filter = normalized
	}
	lines, err := readLines(s.cfg.MailUsersFile)
	if err != nil {
		return nil, apierr.Internal(fmt.Sprintf("read users file: %v", err))
	}
	fallback := modTime(s.cfg.MailUsersFile)
	accounts := make([]Account, 0, len(lines))
	for _, line := range lines {
		entry, ok := parsePasswdLine(line)
		if !ok {
			continue
		}
		email := strings.ToLower(entry.email())
		if filter != "" && domainOf(email) != filter {
			continue
		}
		var quotaMB int64
		if entry.hasQuota {
			quotaMB = entry.quotaBytes / bytesPerMB
		}
		accounts = append(accounts, Account{
			Email:     email,
			Domain:    domainOf(email),
			QuotaMB:   quotaMB,
			Bytes:     dirBytes(entry.home()),
			CreatedAt: accountCreatedAt(entry.home(), fallback),
		})
	}
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].Email < accounts[j].Email })
	return accounts, nil
}

// accountCreatedAt derives an account's creation time from its maildir home
// directory (created together with the account), falling back to the users
// file's modification time when the home is gone. The frozen passwd-file
// layout has no timestamp field.
func accountCreatedAt(home string, fallback time.Time) time.Time {
	if info, err := os.Stat(home); err == nil {
		return info.ModTime().UTC()
	}
	return fallback
}

// CreateAccount creates a mailbox (passwd-file entry + maildir).
func (s *Service) CreateAccount(email, password string, quotaMB int64) (Account, error) {
	if s.cfg.DryRun {
		return Account{}, dryRunErr()
	}
	normalized, err := validateEmail(email)
	if err != nil {
		return Account{}, s.reject(actionAccountCreate, map[string]any{"email": email}, err)
	}
	params := map[string]any{"email": normalized, "domain": domainOf(normalized), "quotaMb": quotaMB}
	if err := validatePassword(password); err != nil {
		return Account{}, s.reject(actionAccountCreate, params, err)
	}
	if err := validateQuota(quotaMB); err != nil {
		return Account{}, s.reject(actionAccountCreate, params, err)
	}
	home, err := s.createAccountFiles(normalized, password, quotaMB)
	if err != nil {
		return Account{}, s.reject(actionAccountCreate, params, err)
	}
	if err := s.record(actionAccountCreate, params); err != nil {
		return Account{}, err
	}
	s.reload()
	return Account{
		Email:     normalized,
		Domain:    domainOf(normalized),
		QuotaMB:   quotaMB,
		Bytes:     dirBytes(home),
		CreatedAt: accountCreatedAt(home, modTime(s.cfg.MailUsersFile)),
	}, nil
}

// createAccountFiles creates the maildir and the passwd-file entry. Errors:
// 404 mail_domain_not_found, 409 mail_account_exists, 500 internal.
func (s *Service) createAccountFiles(email, password string, quotaMB int64) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	domains, err := s.readDomains()
	if err != nil {
		return "", apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	if !containsString(domains, domainOf(email)) {
		return "", apierr.NotFound("mail_domain_not_found", fmt.Sprintf("mail domain %q does not exist", domainOf(email)))
	}
	lines, err := readLines(s.cfg.MailUsersFile)
	if err != nil {
		return "", apierr.Internal(fmt.Sprintf("read users file: %v", err))
	}
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok && strings.EqualFold(entry.email(), email) {
			return "", apierr.Conflict("mail_account_exists", fmt.Sprintf("mail account %q already exists", email))
		}
	}
	home := filepath.Join(s.cfg.MailVhostsDir, email)
	for _, sub := range []string{"cur", "new", "tmp"} {
		dir := filepath.Join(home, sub)
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return "", apierr.Internal(fmt.Sprintf("create maildir %s: %v", dir, err))
		}
	}
	entry := newPasswdEntry(email, hashPassword(password), home, quotaMB)
	lines = append(lines, entry.String())
	if err := writeFileAtomic(s.cfg.MailUsersFile, joinLines(lines), 0o600); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write users file: %v", err))
	}
	return home, nil
}

// DeleteAccount removes a mailbox's passwd-file entry (maildir kept).
func (s *Service) DeleteAccount(email string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	normalized, err := validateEmail(email)
	if err != nil {
		return s.reject(actionAccountDelete, map[string]any{"email": email}, err)
	}
	params := map[string]any{"email": normalized}
	if err := s.removeAccountFile(normalized); err != nil {
		return s.reject(actionAccountDelete, params, err)
	}
	if err := s.record(actionAccountDelete, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// removeAccountFile drops the passwd-file entry; the maildir is kept on disk.
func (s *Service) removeAccountFile(email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.MailUsersFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read users file: %v", err))
	}
	found := false
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if entry, ok := parsePasswdLine(line); ok && strings.EqualFold(entry.email(), email) {
			found = true
			continue
		}
		kept = append(kept, line)
	}
	if !found {
		return apierr.NotFound("mail_account_not_found", fmt.Sprintf("mail account %q does not exist", email))
	}
	if err := writeFileAtomic(s.cfg.MailUsersFile, joinLines(kept), 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write users file: %v", err))
	}
	return nil
}

// SetPassword rewrites one mailbox password entry. The plaintext never
// leaves this call.
func (s *Service) SetPassword(email, password string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	normalized, err := validateEmail(email)
	if err != nil {
		return s.reject(actionAccountPassword, map[string]any{"email": email}, err)
	}
	params := map[string]any{"email": normalized}
	if err := validatePassword(password); err != nil {
		return s.reject(actionAccountPassword, params, err)
	}
	if err := s.updateAccountFile(normalized, func(entry *passwdEntry) {
		entry.fields[1] = hashPassword(password)
	}); err != nil {
		return s.reject(actionAccountPassword, params, err)
	}
	if err := s.record(actionAccountPassword, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// SetQuota updates one mailbox quota.
func (s *Service) SetQuota(email string, quotaMB int64) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	normalized, err := validateEmail(email)
	if err != nil {
		return s.reject(actionAccountQuota, map[string]any{"email": email}, err)
	}
	params := map[string]any{"email": normalized, "quotaMb": quotaMB}
	if err := validateQuota(quotaMB); err != nil {
		return s.reject(actionAccountQuota, params, err)
	}
	if err := s.updateAccountFile(normalized, func(entry *passwdEntry) {
		entry.hasQuota = quotaMB > 0
		entry.quotaBytes = quotaMB * bytesPerMB
	}); err != nil {
		return s.reject(actionAccountQuota, params, err)
	}
	if err := s.record(actionAccountQuota, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

// updateAccountFile rewrites the single passwd-file line matching email,
// preserving every other line and the entry's other fields.
func (s *Service) updateAccountFile(email string, mutate func(*passwdEntry)) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.MailUsersFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read users file: %v", err))
	}
	found := false
	for i, line := range lines {
		entry, ok := parsePasswdLine(line)
		if !ok || !strings.EqualFold(entry.email(), email) {
			continue
		}
		mutate(&entry)
		lines[i] = entry.String()
		found = true
	}
	if !found {
		return apierr.NotFound("mail_account_not_found", fmt.Sprintf("mail account %q does not exist", email))
	}
	if err := writeFileAtomic(s.cfg.MailUsersFile, joinLines(lines), 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write users file: %v", err))
	}
	return nil
}
