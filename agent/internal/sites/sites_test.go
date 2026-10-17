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
	config := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")

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
	config := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
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
	config := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
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

// TestRenderNginxConfigByteIdenticalWithoutExtras pins the v0.1 output: sites
// with no subdomains, redirects or blocked IPs must render exactly as before.
func TestRenderNginxConfigByteIdenticalWithoutExtras(t *testing.T) {
	site := store.Site{Domain: "static.example.org", Root: "/www/wwwroot/static.example.org", PHPVersion: "none"}
	got := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	want := managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name static.example.org www.static.example.org;
    root /www/wwwroot/static.example.org;
    index index.html index.php;

    access_log /var/log/nginx/static.example.org.access.log;
    error_log /var/log/nginx/static.example.org.error.log;

    location / {
        try_files $uri $uri/ =404;
    }
}
`
	if got != want {
		t.Errorf("render changed for a plain site:\n--- got ---\n%s--- want ---\n%s", got, want)
	}
}

// TestRenderNginxConfigByteIdenticalPHPSite pins the v0.1 output for a PHP
// site without v0.4 extras.
func TestRenderNginxConfigByteIdenticalPHPSite(t *testing.T) {
	site := store.Site{Domain: "example.com", Root: "/www/wwwroot/example.com", PHPVersion: "8.3"}
	got := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	want := managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /www/wwwroot/example.com;
    index index.html index.php;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }
}
`
	if got != want {
		t.Errorf("render changed for a PHP site:\n--- got ---\n%s--- want ---\n%s", got, want)
	}
}

// TestRenderNginxConfigByteIdenticalSSLSite pins the v0.1 output for an SSL
// site without v0.4 extras.
func TestRenderNginxConfigByteIdenticalSSLSite(t *testing.T) {
	site := store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "none",
		SSL:        store.SSL{Enabled: true, Issuer: "Let's Encrypt"},
	}
	got := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	want := managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name example.com www.example.com;
    root /www/wwwroot/example.com;
    index index.html index.php;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    access_log /var/log/nginx/example.com.access.log;
    error_log /var/log/nginx/example.com.error.log;

    location / {
        try_files $uri $uri/ =404;
    }
}
`
	if got != want {
		t.Errorf("render changed for an SSL site:\n--- got ---\n%s--- want ---\n%s", got, want)
	}
}

func TestRenderNginxConfigWithSiteOperations(t *testing.T) {
	site := store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "8.3",
		Redirects: []store.Redirect{
			{ID: "aabbccdd", From: "/old", To: "https://new.example.net", Permanent: true},
			{ID: "11223344", From: "/go", To: "http://plain.example.net", Permanent: false},
		},
		BlockedIPs: []store.BlockedIP{{IP: "203.0.113.9"}, {IP: "2001:db8::1"}},
		Subdomains: []store.Subdomain{{Name: "blog"}},
	}
	config := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")

	for _, want := range []string{
		"location /old { return 301 https://new.example.net; }",
		"location /go { return 302 http://plain.example.net; }",
		"deny 203.0.113.9;",
		"deny 2001:db8::1;",
		"server_name blog.example.com;",
		"root /www/wwwroot/example.com/blog;",
		"fastcgi_pass unix:/run/php/php8.3-fpm.sock;",
	} {
		if !strings.Contains(config, want) {
			t.Errorf("config missing %q:\n%s", want, config)
		}
	}
	if got := strings.Count(config, "server {"); got != 2 {
		t.Errorf("server blocks = %d, want 2 (main + subdomain):\n%s", got, config)
	}
	// Redirects and denies apply to every server block of the site.
	if got := strings.Count(config, "location /old { return 301 https://new.example.net; }"); got != 2 {
		t.Errorf("redirect occurrences = %d, want 2 (main + subdomain):\n%s", got, config)
	}
	if got := strings.Count(config, "deny 203.0.113.9;"); got != 2 {
		t.Errorf("deny occurrences = %d, want 2 (main + subdomain):\n%s", got, config)
	}
	// The subdomain keeps the site's access log.
	if got := strings.Count(config, "access_log /var/log/nginx/example.com.access.log;"); got != 2 {
		t.Errorf("access_log occurrences = %d, want 2 (main + subdomain):\n%s", got, config)
	}
}

func TestRenderNginxConfigSSLWithSiteOperations(t *testing.T) {
	site := store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "none",
		SSL:        store.SSL{Enabled: true},
		Redirects:  []store.Redirect{{ID: "aabbccdd", From: "/old", To: "https://new.example.net", Permanent: true}},
		BlockedIPs: []store.BlockedIP{{IP: "203.0.113.9"}},
		Subdomains: []store.Subdomain{{Name: "shop"}},
	}
	config := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	if got := strings.Count(config, "server {"); got != 3 {
		t.Errorf("server blocks = %d, want 3 (http + https + subdomain):\n%s", got, config)
	}
	if got := strings.Count(config, "location /old { return 301 https://new.example.net; }"); got != 3 {
		t.Errorf("redirect occurrences = %d, want 3:\n%s", got, config)
	}
	if got := strings.Count(config, "deny 203.0.113.9;"); got != 3 {
		t.Errorf("deny occurrences = %d, want 3:\n%s", got, config)
	}
	if !strings.Contains(config, "server_name shop.example.com;") {
		t.Errorf("config missing subdomain server block:\n%s", config)
	}
}
