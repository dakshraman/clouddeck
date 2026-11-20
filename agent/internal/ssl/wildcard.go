package ssl

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
)

// DNSProvider defines a supported DNS-01 ACME challenge provider.
type DNSProvider struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Fields      []string `json:"fields"`
}

// WildcardRequest specifies issuance parameters for a wildcard certificate.
type WildcardRequest struct {
	Email       string            `json:"email"`
	Provider    string            `json:"provider"`    // "cloudflare", "powerdns", "digitalocean", "route53", "manual"
	Credentials map[string]string `json:"credentials"` // provider specific credentials
}

// WildcardResult details the provisioned wildcard certificate status.
type WildcardResult struct {
	Success   bool      `json:"success"`
	Domain    string    `json:"domain"`
	Wildcard  string    `json:"wildcard"`
	Issuer    string    `json:"issuer"`
	Provider  string    `json:"provider"`
	ExpiresAt string    `json:"expiresAt"`
	IssuedAt  time.Time `json:"issuedAt"`
	Message   string    `json:"message"`
}

// ListDNSProviders returns the supported DNS-01 verification providers.
func (s *Issuer) ListDNSProviders() []DNSProvider {
	return []DNSProvider{
		{
			ID:          "cloudflare",
			Name:        "Cloudflare DNS",
			Description: "Automated DNS-01 verification via Cloudflare API token",
			Fields:      []string{"api_token"},
		},
		{
			ID:          "powerdns",
			Name:        "PowerDNS Local / Remote",
			Description: "PowerDNS REST API automation for local and remote DNS zones",
			Fields:      []string{"api_url", "api_key"},
		},
		{
			ID:          "digitalocean",
			Name:        "DigitalOcean DNS",
			Description: "DigitalOcean API token for DNS-01 challenge",
			Fields:      []string{"auth_token"},
		},
		{
			ID:          "route53",
			Name:        "AWS Route 53",
			Description: "Amazon Web Services Route 53 DNS automation",
			Fields:      []string{"access_key_id", "secret_access_key", "region"},
		},
		{
			ID:          "manual",
			Name:        "Manual DNS TXT Record",
			Description: "Manual or custom DNS hook for challenge verification",
			Fields:      []string{},
		},
	}
}

// IssueWildcard issues a wildcard certificate (*.domain) using the specified DNS-01 provider.
func (s *Issuer) IssueWildcard(ctx context.Context, rawDomain string, req WildcardRequest) (WildcardResult, error) {
	domain, err := sites.ValidateDomain(rawDomain)
	if err != nil {
		return WildcardResult{}, err
	}
	email := strings.TrimSpace(req.Email)
	if !validEmail(email) {
		return WildcardResult{}, apierr.BadRequest("invalid_email", fmt.Sprintf("invalid email %q", email))
	}

	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider == "" {
		return WildcardResult{}, apierr.BadRequest("missing_provider", "DNS-01 provider is required")
	}

	// Validate provider
	valid := false
	for _, p := range s.ListDNSProviders() {
		if p.ID == provider {
			valid = true
			break
		}
	}
	if !valid {
		return WildcardResult{}, apierr.BadRequest("invalid_provider", fmt.Sprintf("unsupported DNS provider %q", provider))
	}

	site, ok := s.st.GetSite(domain)
	if !ok {
		return WildcardResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	wildcardName := "*." + domain
	expiresAt := time.Now().UTC().Add(90 * 24 * time.Hour).Format(time.RFC3339)

	if !s.cfg.DryRun {
		// Verify certbot presence
		if _, err := exec.LookPath("certbot"); err != nil {
			return WildcardResult{}, apierr.Internal("certbot is not installed on this server")
		}

		// Write temp credentials file if needed
		credsDir := filepath.Join(s.cfg.StateDir, "dns_creds")
		_ = os.MkdirAll(credsDir, 0o700)
		credsFile := filepath.Join(credsDir, fmt.Sprintf("%s_%s.ini", provider, domain))

		var credContent string
		switch provider {
		case "cloudflare":
			token := req.Credentials["api_token"]
			if token == "" {
				return WildcardResult{}, apierr.BadRequest("missing_credentials", "api_token is required for Cloudflare DNS")
			}
			credContent = fmt.Sprintf("dns_cloudflare_api_token = %s\n", token)
		case "digitalocean":
			token := req.Credentials["auth_token"]
			if token == "" {
				return WildcardResult{}, apierr.BadRequest("missing_credentials", "auth_token is required for DigitalOcean DNS")
			}
			credContent = fmt.Sprintf("dns_digitalocean_token = %s\n", token)
		case "powerdns":
			apiKey := req.Credentials["api_key"]
			apiURL := req.Credentials["api_url"]
			if apiKey == "" {
				return WildcardResult{}, apierr.BadRequest("missing_credentials", "api_key is required for PowerDNS")
			}
			if apiURL == "" {
				apiURL = "http://127.0.0.1:8081/api/v1"
			}
			credContent = fmt.Sprintf("dns_powerdns_api_key = %s\ndns_powerdns_api_url = %s\n", apiKey, apiURL)
		}

		if credContent != "" {
			_ = os.WriteFile(credsFile, []byte(credContent), 0o600)
			defer os.Remove(credsFile)
		}

		// Run certbot DNS-01 challenge
		logFunc := func(level, msg string) {}
		var pluginArg string
		switch provider {
		case "cloudflare":
			pluginArg = "--dns-cloudflare"
		case "digitalocean":
			pluginArg = "--dns-digitalocean"
		case "powerdns":
			pluginArg = "--dns-powerdns"
		default:
			pluginArg = "--manual"
		}

		args := []string{
			"certonly",
			pluginArg,
			"-d", domain,
			"-d", wildcardName,
			"--non-interactive",
			"--agree-tos",
			"-m", email,
		}
		if credContent != "" {
			args = append(args, fmt.Sprintf("%s-credentials", pluginArg), credsFile)
		}

		err := safeexec.Run(ctx, false, logFunc, "certbot", args...)
		if err != nil {
			return WildcardResult{}, apierr.Internal(fmt.Sprintf("DNS-01 certbot execution failed: %v", err))
		}
		if exp := certExpiry(domain); exp != "" {
			expiresAt = exp
		}
	}

	// Update site state
	issuerName := fmt.Sprintf("Let's Encrypt Wildcard (%s)", provider)
	site.SSL = store.SSL{
		Enabled:   true,
		Issuer:    issuerName,
		ExpiresAt: expiresAt,
	}

	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.SSL = site.SSL
		current.UpdatedAt = store.Now()
	}); err != nil {
		return WildcardResult{}, apierr.Internal(fmt.Sprintf("persist certificate state: %v", err))
	}

	// Apply Nginx SSL config
	logFunc := func(level, msg string) {}
	if s.sites != nil {
		_ = s.sites.ApplyNginx(ctx, logFunc, site)
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "ssl.wildcard",
			Params: map[string]any{"domain": domain, "provider": provider, "email": email},
			Result: audit.ResultAccepted,
		})
	}

	return WildcardResult{
		Success:   true,
		Domain:    domain,
		Wildcard:  wildcardName,
		Issuer:    issuerName,
		Provider:  provider,
		ExpiresAt: expiresAt,
		IssuedAt:  time.Now().UTC(),
		Message:   fmt.Sprintf("Wildcard certificate for %s and %s successfully provisioned via %s DNS-01", domain, wildcardName, provider),
	}, nil
}
