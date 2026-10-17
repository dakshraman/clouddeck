package mail

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/sites"
)

// Frozen limits from docs/api.md section 1.6.
const (
	// bytesPerMB converts the API's quota unit into the passwd-file rule.
	bytesPerMB = 1048576
	// maxQuotaMB is the frozen quota ceiling (0 = unlimited).
	maxQuotaMB = 1048576
	// minPasswordLen is the frozen minimum password length.
	minPasswordLen = 8
	// maxSubjectRunes bounds an autoresponder subject.
	maxSubjectRunes = 200
	// maxBodyRunes bounds an autoresponder body.
	maxBodyRunes = 10000
	// defaultUID/defaultGID are the frozen virtual-user ids.
	defaultUID = "5000"
	defaultGID = "5000"
	// dkimSelector is the frozen DKIM selector.
	dkimSelector = "clouddeck"
	// dkimKeyBits is the frozen RSA key size.
	dkimKeyBits = 2048
	// dnsRecordTTL is the frozen TTL of published DNS records.
	dnsRecordTTL = 3600
	// dnsStatusTimeout bounds the DNS lookup DKIMStatus performs.
	dnsStatusTimeout = 5 * time.Second
)

// localPartRe is the frozen email local-part regex. Emails are lowercased
// before it is applied.
var localPartRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9._-]{0,62})?$`)

// validateEmail lowercases raw and checks it against the frozen local-part
// regex and the shared domain regex; the normalized address is returned.
func validateEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return "", invalidEmail(raw)
	}
	if !localPartRe.MatchString(email[:at]) {
		return "", invalidEmail(raw)
	}
	if _, err := sites.ValidateDomain(email[at+1:]); err != nil {
		return "", invalidEmail(raw)
	}
	return email, nil
}

func invalidEmail(raw string) error {
	return apierr.BadRequest("invalid_email", fmt.Sprintf("invalid email address %q", raw))
}

// domainOf returns the domain part of an already-normalized address.
func domainOf(email string) string {
	if i := strings.LastIndex(email, "@"); i >= 0 {
		return email[i+1:]
	}
	return ""
}

// validatePassword enforces the frozen minimum length. The plaintext is only
// ever held in memory: it is never stored, logged or audited.
func validatePassword(password string) error {
	if utf8.RuneCountInString(password) < minPasswordLen {
		return apierr.BadRequest("invalid_password", fmt.Sprintf("password must be at least %d characters", minPasswordLen))
	}
	return nil
}

// validateQuota enforces the frozen 0-1048576 MB range (0 = unlimited).
func validateQuota(quotaMB int64) error {
	if quotaMB < 0 || quotaMB > maxQuotaMB {
		return apierr.BadRequest("invalid_quota", fmt.Sprintf("quota %d MB is outside 0-%d MB", quotaMB, maxQuotaMB))
	}
	return nil
}

// validateAutoresponder checks the subject and body bounds. Subjects must be
// single-line so they can be rendered as a Sieve quoted string.
func validateAutoresponder(subject, body string) error {
	if utf8.RuneCountInString(subject) < 1 || utf8.RuneCountInString(subject) > maxSubjectRunes {
		return apierr.BadRequest("invalid_autoresponder", fmt.Sprintf("subject must be 1-%d characters", maxSubjectRunes))
	}
	if strings.ContainsAny(subject, "\r\n") {
		return apierr.BadRequest("invalid_autoresponder", "subject must not contain line breaks")
	}
	if utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > maxBodyRunes {
		return apierr.BadRequest("invalid_autoresponder", fmt.Sprintf("body must be 1-%d characters", maxBodyRunes))
	}
	return nil
}
