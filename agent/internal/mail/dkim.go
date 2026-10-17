package mail

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/dns"
	"clouddeck/agent/internal/sites"
)

// actionDNSApply is the audit action of POST /v1/mail/dns/{domain}.
const actionDNSApply = "mail.dns.apply"

// DNS presets frozen by docs/api.md section 1.6.
const spfPreset = "v=spf1 a mx ~all"

// dkimMetadata is the dkim/<domain>.json payload.
type dkimMetadata struct {
	Domain    string    `json:"domain"`
	Selector  string    `json:"selector"`
	CreatedAt time.Time `json:"createdAt"`
}

// DKIMStatus reports one domain's DKIM state.
func (s *Service) DKIMStatus(domain string) (DKIMInfo, error) {
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		return DKIMInfo{}, err
	}
	info := DKIMInfo{Domain: normalized, Selector: dkimSelector}
	keyPEM, err := os.ReadFile(s.dkimPath(normalized, ".key"))
	if errors.Is(err, fs.ErrNotExist) {
		return info, nil
	}
	if err != nil {
		return DKIMInfo{}, apierr.Internal(fmt.Sprintf("read DKIM key: %v", err))
	}
	value, err := dkimTXTValue(keyPEM)
	if err != nil {
		return DKIMInfo{}, apierr.Internal(fmt.Sprintf("parse DKIM key for %s: %v", normalized, err))
	}
	info.Enabled = true
	info.DNSName = dkimSelector + "._domainkey." + normalized
	info.DNSRecord = value
	if data, readErr := os.ReadFile(s.dkimPath(normalized, ".txt")); readErr == nil {
		if stored := strings.TrimSpace(string(data)); stored != "" {
			info.DNSRecord = stored
		}
	}
	info.DNSApplied = s.dkimPublished(normalized)
	return info, nil
}

// dkimPublished reports whether the selector's TXT record currently exists in
// the domain's PowerDNS zone. A short timeout bounds the lookup; any DNS
// error (missing zone, pdnsutil failure, timeout) counts as not applied.
func (s *Service) dkimPublished(domain string) bool {
	if s.dns == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), dnsStatusTimeout)
	defer cancel()
	records, err := s.dns.Records(ctx, domain)
	if err != nil {
		return false
	}
	name := dkimSelector + "._domainkey"
	for _, record := range records {
		if record.Name == name && record.Type == "TXT" {
			return true
		}
	}
	return false
}

// mailRecord is one record ApplyDNS may publish.
type mailRecord struct {
	part    string
	name    string
	rtype   string
	content string
}

// ApplyDNS generates/keeps the DKIM keypair and publishes the requested
// records (SPF, DMARC, DKIM, MX) into the domain's PowerDNS zone. Per-record
// failures land in result.Errors instead of failing the whole request.
func (s *Service) ApplyDNS(ctx context.Context, domain string, opts DNSOptions) (DNSResult, error) {
	if s.cfg.DryRun {
		return DNSResult{}, dryRunErr()
	}
	params := map[string]any{"domain": domain, "spf": opts.SPF, "dmarcPolicy": opts.DMARCPolicy, "dkim": opts.DKIM, "mx": opts.MX}
	normalized, err := sites.ValidateDomain(domain)
	if err != nil {
		return DNSResult{}, s.reject(actionDNSApply, params, err)
	}
	params["domain"] = normalized
	policy := strings.TrimSpace(opts.DMARCPolicy)
	switch policy {
	case "", "none", "quarantine", "reject":
	default:
		return DNSResult{}, s.reject(actionDNSApply, params, apierr.BadRequest("invalid_request",
			fmt.Sprintf("dmarcPolicy %q must be \"none\", \"quarantine\", \"reject\" or empty", opts.DMARCPolicy)))
	}
	params["dmarcPolicy"] = policy

	result := DNSResult{Applied: map[string]string{}}
	records := make([]mailRecord, 0, 4)

	// The local keypair is generated first so a DNS outage never loses it.
	var dkimTXT string
	if opts.DKIM {
		value, err := s.ensureDKIMKey(normalized)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("dkim: %v", err))
		} else {
			dkimTXT = value
		}
	}
	if opts.SPF {
		records = append(records, mailRecord{part: "spf", name: "@", rtype: "TXT", content: spfPreset})
	}
	if policy != "" {
		records = append(records, mailRecord{part: "dmarc", name: "_dmarc", rtype: "TXT", content: "v=DMARC1; p=" + policy})
	}
	if dkimTXT != "" {
		records = append(records, mailRecord{part: "dkim", name: dkimSelector + "._domainkey", rtype: "TXT", content: dkimTXT})
	}
	if opts.MX {
		if host := strings.TrimSpace(s.cfg.MailHostname); host == "" {
			result.Errors = append(result.Errors, "mx: AGENT_MAIL_HOSTNAME is not configured; MX record skipped")
		} else {
			records = append(records, mailRecord{part: "mx", name: "@", rtype: "MX", content: "10 " + host})
		}
	}

	if len(records) > 0 {
		if s.dns == nil {
			result.Errors = append(result.Errors, "dns: DNS manager is not configured")
		} else {
			zones, err := s.dns.Zones(ctx)
			switch {
			case err != nil:
				result.Errors = append(result.Errors, fmt.Sprintf("list DNS zones: %v", err))
			case !zonesContain(zones, normalized):
				result.Errors = append(result.Errors, fmt.Sprintf("zone %s not found", normalized))
			default:
				for _, record := range records {
					if _, err := s.dns.AddRecord(ctx, normalized, record.name, record.rtype, record.content, dnsRecordTTL); err != nil {
						result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", record.part, err))
						continue
					}
					result.Applied[record.part] = record.content
				}
			}
		}
	}

	params["applied"] = len(result.Applied)
	if len(result.Errors) > 0 {
		params["errors"] = result.Errors
	}
	if err := s.record(actionDNSApply, params); err != nil {
		return DNSResult{}, err
	}
	return result, nil
}

// zonesContain reports whether the zone list holds domain.
func zonesContain(zones []dns.Zone, domain string) bool {
	for _, zone := range zones {
		if zone.Name == domain {
			return true
		}
	}
	return false
}

// ensureDKIMKey returns the TXT value, generating and persisting the keypair
// and metadata when the domain has none yet. Existing keys are kept.
func (s *Service) ensureDKIMKey(domain string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	keyPath := s.dkimPath(domain, ".key")
	keyPEM, err := os.ReadFile(keyPath)
	if err == nil {
		value, parseErr := dkimTXTValue(keyPEM)
		if parseErr != nil {
			return "", fmt.Errorf("parse existing key: %w", parseErr)
		}
		// Repair a missing or stale .txt without touching the keypair.
		if data, readErr := os.ReadFile(s.dkimPath(domain, ".txt")); readErr != nil || strings.TrimSpace(string(data)) != value {
			if err := writeFileAtomic(s.dkimPath(domain, ".txt"), []byte(value+"\n"), 0o644); err != nil {
				return "", fmt.Errorf("rewrite DKIM record: %w", err)
			}
		}
		if _, statErr := os.Stat(s.dkimPath(domain, ".json")); errors.Is(statErr, fs.ErrNotExist) {
			if err := s.writeDKIMMetadata(domain, time.Time{}); err != nil {
				return "", err
			}
		}
		return value, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return "", fmt.Errorf("read key: %w", err)
	}

	key, err := rsa.GenerateKey(rand.Reader, dkimKeyBits)
	if err != nil {
		return "", fmt.Errorf("generate key: %w", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return "", fmt.Errorf("encode key: %w", err)
	}
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	value, err := dkimTXTValue(keyPEM)
	if err != nil {
		return "", fmt.Errorf("render record: %w", err)
	}
	if err := os.MkdirAll(s.cfg.MailDkimDir, 0o700); err != nil {
		return "", fmt.Errorf("create DKIM dir: %w", err)
	}
	if err := writeFileAtomic(keyPath, keyPEM, 0o600); err != nil {
		return "", fmt.Errorf("write key: %w", err)
	}
	if err := writeFileAtomic(s.dkimPath(domain, ".txt"), []byte(value+"\n"), 0o644); err != nil {
		return "", fmt.Errorf("write record: %w", err)
	}
	if err := s.writeDKIMMetadata(domain, time.Now().UTC().Truncate(time.Second)); err != nil {
		return "", err
	}
	return value, nil
}

// writeDKIMMetadata writes dkim/<domain>.json. A zero createdAt means "now".
func (s *Service) writeDKIMMetadata(domain string, createdAt time.Time) error {
	if createdAt.IsZero() {
		createdAt = time.Now().UTC().Truncate(time.Second)
	}
	data, err := json.MarshalIndent(dkimMetadata{Domain: domain, Selector: dkimSelector, CreatedAt: createdAt}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode metadata: %w", err)
	}
	data = append(data, '\n')
	if err := writeFileAtomic(s.dkimPath(domain, ".json"), data, 0o644); err != nil {
		return fmt.Errorf("write metadata: %w", err)
	}
	return nil
}

// dkimPath builds the dkim/<domain><ext> path; domains are validated first.
func (s *Service) dkimPath(domain, ext string) string {
	return filepath.Join(s.cfg.MailDkimDir, domain+ext)
}

// dkimTXTValue derives the frozen "v=DKIM1; k=rsa; p=<base64 SPKI>" value
// from a PKCS#8 PEM private key.
func dkimTXTValue(keyPEM []byte) (string, error) {
	block, _ := pem.Decode(keyPEM)
	if block == nil || block.Type != "PRIVATE KEY" {
		return "", errors.New("key is not a PKCS#8 PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return "", errors.New("key is not an RSA private key")
	}
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		return "", err
	}
	return "v=DKIM1; k=rsa; p=" + base64.StdEncoding.EncodeToString(der), nil
}
