package sites

import (
	"strings"
	"testing"

	"clouddeck/agent/internal/store"
)

func testSite() store.Site {
	return store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "none",
	}
}

// A site without apps must render exactly the pre-v0.6 config (no proxy block).
func TestRenderNoAppsHasNoProxy(t *testing.T) {
	conf := RenderNginxConfig(testSite(), "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	if strings.Contains(conf, "proxy_pass") {
		t.Fatalf("static site config must not contain proxy_pass:\n%s", conf)
	}
	if strings.Contains(conf, "clouddeck app:") {
		t.Fatal("static site config must not contain app blocks")
	}
}

func TestRenderProxyPathPrefix(t *testing.T) {
	proxies := ProxyTargets{Apps: []appProxy{
		{Name: "api", Port: 3000},
		{Name: "worker", Port: 4000},
	}}
	conf := renderNginxConfigWithApps(testSite(), "/var/log/nginx", "", "", "", proxies, 0)

	if !strings.Contains(conf, "location /api/ {") {
		t.Fatalf("missing /api/ location:\n%s", conf)
	}
	if !strings.Contains(conf, "proxy_pass http://127.0.0.1:3000/;") {
		t.Fatal("missing api upstream")
	}
	if !strings.Contains(conf, "location /worker/ {") {
		t.Fatal("missing /worker/ location")
	}
	// Two apps: neither may own "/".
	if strings.Contains(conf, "proxy_pass http://127.0.0.1:3000/;\n        proxy_http_version") &&
		strings.Contains(conf, "# clouddeck app: primary upstream at /") {
		t.Fatal("root proxy must not be emitted when a site has several apps")
	}
	// WebSocket upgrade headers are required for dev servers and SSR apps.
	if !strings.Contains(conf, "proxy_set_header Upgrade $http_upgrade;") {
		t.Fatal("missing WebSocket upgrade headers")
	}
	// Slash normalization redirect for prefix apps.
	if !strings.Contains(conf, "location = /api {\n        return 308 /api/$is_args$args;\n    }") {
		t.Fatalf("missing trailing slash redirect for /api:\n%s", conf)
	}
	// Forwarded headers and proxy buffer tuning.
	if !strings.Contains(conf, "proxy_set_header X-Forwarded-Host $host;") {
		t.Fatal("missing X-Forwarded-Host header")
	}
	if !strings.Contains(conf, "proxy_buffer_size 128k;") {
		t.Fatal("missing proxy buffer tuning")
	}
}

func TestRenderSingleAppOwnsRoot(t *testing.T) {
	proxies := ProxyTargets{}
	conf := renderNginxConfigWithApps(testSite(), "/var/log/nginx", "", "", "", proxies, 3000)

	if !strings.Contains(conf, "# clouddeck app: primary upstream at /") {
		t.Fatalf("single app should own the root location:\n%s", conf)
	}
	if !strings.Contains(conf, "proxy_pass http://127.0.0.1:3000/;") {
		t.Fatal("missing root upstream")
	}
}

// SSL sites must carry the same proxy blocks.
func TestRenderSSLIncludesProxy(t *testing.T) {
	site := testSite()
	site.SSL.Enabled = true
	proxies := ProxyTargets{Apps: []appProxy{{Name: "api", Port: 3000}}}
	conf := renderNginxConfigWithApps(site, "/var/log/nginx", "", "", "", proxies, 0)

	// The HTTP block is a 301 redirect to HTTPS, so the proxy appears once, in
	// the TLS server block.
	if strings.Count(conf, "location /api/ {") != 1 {
		t.Fatalf("expected one proxy block in the HTTPS server block, got %d:\n%s",
			strings.Count(conf, "location /api/ {"), conf)
	}
}

// PHP sites keep their fastcgi block alongside app proxies.
func TestRenderPHPAndProxyCoexist(t *testing.T) {
	site := testSite()
	site.PHPVersion = "8.3"
	proxies := ProxyTargets{Apps: []appProxy{{Name: "api", Port: 3000}}}
	conf := renderNginxConfigWithApps(site, "/var/log/nginx", "/run/php/php8.3-fpm.sock", "", "", proxies, 0)

	if !strings.Contains(conf, "fastcgi_pass unix:/run/php/php8.3-fpm.sock;") {
		t.Fatal("PHP site lost its fastcgi block")
	}
	if !strings.Contains(conf, "location /api/ {") {
		t.Fatal("PHP site lost its app proxy block")
	}
}
