package sites

import (
	"strings"
	"testing"

	"clouddeck/agent/internal/store"
)

func TestValidateDomain(t *testing.T) {
	valid := []string{
		"example.com",
		"sub.example.co.uk",
		"xn--d1acufc.xn--p1ai",
		"a-b.com",
		"upper.com",
		"a.very-long-subdomain-label-that-is-still-within-limits.example.com",
		strings.Repeat("a", 63) + ".com",
		"0domain.com",
	}
	for _, domain := range valid {
		if _, err := ValidateDomain(domain); err != nil {
			t.Errorf("ValidateDomain(%q) = %v, want valid", domain, err)
		}
	}

	invalid := []string{
		"",
		"exa mple.com",
		"no_tld",
		"-start.com",
		"end-.com",
		"a..b.com",
		".com",
		"com",
		"example",
		strings.Repeat("a", 64) + ".com",
		"example.com.",
		"ex*ample.com",
	}
	for _, domain := range invalid {
		if _, err := ValidateDomain(domain); err == nil {
			t.Errorf("ValidateDomain(%q) = nil, want error", domain)
		}
	}
}

func TestValidateDomainNormalizes(t *testing.T) {
	got, err := ValidateDomain("  Example.COM  ")
	if err != nil {
		t.Fatalf("ValidateDomain(Example.COM) = %v, want valid", err)
	}
	if got != "example.com" {
		t.Errorf("normalized domain = %q, want %q", got, "example.com")
	}
}

func TestRenderNginxConfig(t *testing.T) {
	site := store.Site{Domain: "example.com", Root: "/www/wwwroot/example.com", PHPVersion: "8.3"}
	config := RenderNginxConfig(site, "/var/log/nginx")

	for _, want := range []string{
		managedMarker,
		"server_name example.com www.example.com;",
		"root /www/wwwroot/example.com;",
		"listen 80;",
		"fastcgi_pass unix:/run/php/php8.3-fpm.sock;",
	} {
		if !strings.Contains(config, want) {
			t.Errorf("config missing %q:\n%s", want, config)
		}
	}
	if strings.Contains(config, "listen 443") {
		t.Errorf("config for non-SSL site contains an HTTPS block:\n%s", config)
	}
}

func TestRenderNginxConfigStaticSite(t *testing.T) {
	site := store.Site{Domain: "static.example.org", Root: "/www/wwwroot/static.example.org", PHPVersion: "none"}
	config := RenderNginxConfig(site, "/var/log/nginx")
	if strings.Contains(config, "fastcgi_pass") {
		t.Errorf("static site config contains PHP block:\n%s", config)
	}
}

func TestRenderNginxConfigWithSSL(t *testing.T) {
	site := store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "none",
		SSL:        store.SSL{Enabled: true, Issuer: "Let's Encrypt"},
	}
	config := RenderNginxConfig(site, "/var/log/nginx")
	for _, want := range []string{
		managedMarker,
		"listen 443 ssl;",
		"return 301 https://$host$request_uri;",
		"ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;",
		"ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;",
	} {
		if !strings.Contains(config, want) {
			t.Errorf("config missing %q:\n%s", want, config)
		}
	}
}
