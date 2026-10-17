package mail

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
)

// Audit actions owned by the autoresponder endpoints.
const (
	actionAutoresponderSet    = "mail.autoresponder.set"
	actionAutoresponderDelete = "mail.autoresponder.delete"
)

// GetAutoresponder returns one address's vacation reply.
func (s *Service) GetAutoresponder(email string) (Autoresponder, error) {
	normalized, err := validateEmail(email)
	if err != nil {
		return Autoresponder{}, err
	}
	data, err := os.ReadFile(s.autoresponderPath(normalized, ".json"))
	if errors.Is(err, fs.ErrNotExist) {
		return Autoresponder{}, apierr.NotFound("autoresponder_not_found", fmt.Sprintf("autoresponder for %q does not exist", normalized))
	}
	if err != nil {
		return Autoresponder{}, apierr.Internal(fmt.Sprintf("read autoresponder: %v", err))
	}
	var responder Autoresponder
	if err := json.Unmarshal(data, &responder); err != nil {
		return Autoresponder{}, apierr.Internal(fmt.Sprintf("decode autoresponder: %v", err))
	}
	return responder, nil
}

// SetAutoresponder upserts one address's vacation reply, rewriting both the
// sieve script and the JSON metadata.
func (s *Service) SetAutoresponder(a Autoresponder) (Autoresponder, error) {
	if s.cfg.DryRun {
		return Autoresponder{}, dryRunErr()
	}
	normalized, err := validateEmail(a.Email)
	if err != nil {
		return Autoresponder{}, s.reject(actionAutoresponderSet, map[string]any{"email": a.Email}, err)
	}
	params := map[string]any{"email": normalized, "enabled": a.Enabled}
	if err := validateAutoresponder(a.Subject, a.Body); err != nil {
		return Autoresponder{}, s.reject(actionAutoresponderSet, params, err)
	}
	a.Email = normalized
	a.UpdatedAt = time.Now().UTC().Truncate(time.Second)
	if err := s.writeAutoresponder(a); err != nil {
		return Autoresponder{}, s.reject(actionAutoresponderSet, params, err)
	}
	if err := s.record(actionAutoresponderSet, params); err != nil {
		return Autoresponder{}, err
	}
	return a, nil
}

// writeAutoresponder writes the sieve script and metadata files. Errors: 404
// mail_domain_not_found, 500 internal.
func (s *Service) writeAutoresponder(a Autoresponder) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	domains, err := s.readDomains()
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	if !containsString(domains, domainOf(a.Email)) {
		return apierr.NotFound("mail_domain_not_found", fmt.Sprintf("mail domain %q does not exist", domainOf(a.Email)))
	}
	if err := os.MkdirAll(s.cfg.MailAutoreplyDir, 0o700); err != nil {
		return apierr.Internal(fmt.Sprintf("create autoreply dir: %v", err))
	}
	data, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return apierr.Internal(fmt.Sprintf("encode autoresponder: %v", err))
	}
	data = append(data, '\n')
	if err := writeFileAtomic(s.autoresponderPath(a.Email, ".sieve"), renderSieve(a), 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write autoresponder script: %v", err))
	}
	if err := writeFileAtomic(s.autoresponderPath(a.Email, ".json"), data, 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write autoresponder metadata: %v", err))
	}
	return nil
}

// DeleteAutoresponder removes one address's vacation reply.
func (s *Service) DeleteAutoresponder(email string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	normalized, err := validateEmail(email)
	if err != nil {
		return s.reject(actionAutoresponderDelete, map[string]any{"email": email}, err)
	}
	params := map[string]any{"email": normalized}
	if err := s.removeAutoresponder(normalized); err != nil {
		return s.reject(actionAutoresponderDelete, params, err)
	}
	if err := s.record(actionAutoresponderDelete, params); err != nil {
		return err
	}
	return nil
}

// removeAutoresponder removes the metadata and script files. An orphaned
// file of either kind counts as an existing autoresponder.
func (s *Service) removeAutoresponder(email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	removed := false
	for _, path := range []string{
		s.autoresponderPath(email, ".json"),
		s.autoresponderPath(email, ".sieve"),
	} {
		err := os.Remove(path)
		switch {
		case err == nil:
			removed = true
		case errors.Is(err, fs.ErrNotExist):
		default:
			return apierr.Internal(fmt.Sprintf("remove %s: %v", path, err))
		}
	}
	if !removed {
		return apierr.NotFound("autoresponder_not_found", fmt.Sprintf("autoresponder for %q does not exist", email))
	}
	return nil
}

// autoresponderPath builds the autoreply/<email>.sieve or .json path. Emails
// are validated first, so they never contain separators.
func (s *Service) autoresponderPath(email, ext string) string {
	return filepath.Join(s.cfg.MailAutoreplyDir, email+ext)
}

// renderSieve renders a valid vacation-extension script. The body uses a
// dot-stuffed multi-line string; the subject is escaped as a quoted string.
// A disabled responder keeps a valid script that performs no action.
func renderSieve(a Autoresponder) []byte {
	var b strings.Builder
	b.WriteString("require [\"vacation\"];\n")
	if !a.Enabled {
		b.WriteString("# autoresponder disabled\n")
		return []byte(b.String())
	}
	b.WriteString("\nvacation\n")
	b.WriteString("  :subject " + sieveQuote(a.Subject) + "\n")
	b.WriteString("  text:\n")
	body := strings.ReplaceAll(a.Body, "\r\n", "\n")
	body = strings.ReplaceAll(body, "\r", "\n")
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, ".") {
			b.WriteString(".")
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	b.WriteString(".\n;\n")
	return []byte(b.String())
}

// sieveQuote renders s as a Sieve quoted string.
func sieveQuote(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}
