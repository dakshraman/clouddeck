package sites

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

// writeExecScript drops an executable POSIX shell script with the given body.
func writeExecScript(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		t.Fatalf("write script %s: %v", path, err)
	}
}

// TestDetectWAFEngine pins the per-call `<NginxBin> -V` module detection,
// including the nginx-rules fallbacks for a missing binary and a failed exec.
func TestDetectWAFEngine(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake nginx scripts require a POSIX shell")
	}
	dir := t.TempDir()
	modsecBin := filepath.Join(dir, "nginx-modsecurity")
	plainBin := filepath.Join(dir, "nginx-plain")
	failBin := filepath.Join(dir, "nginx-fail")
	writeExecScript(t, modsecBin, `echo "configure arguments: --add-dynamic-module=/usr/lib/nginx/modules/ngx_http_ModSecurity_module.so"`)
	writeExecScript(t, plainBin, `echo "configure arguments: --with-http_ssl_module"`)
	writeExecScript(t, failBin, "exit 1")

	cases := []struct {
		name string
		bin  string
		want string
	}{
		{"modsecurity module", modsecBin, WAFEngineModSecurity},
		{"plain nginx", plainBin, WAFEngineNginxRules},
		{"failed exec", failBin, WAFEngineNginxRules},
		{"missing binary", filepath.Join(dir, "no-such-nginx"), WAFEngineNginxRules},
	}
	for _, tc := range cases {
		if got := detectWAFEngine(config.Config{NginxBin: tc.bin}); got != tc.want {
			t.Errorf("detectWAFEngine(%s) = %q, want %q", tc.name, got, tc.want)
		}
	}
}

// TestRenderWAFBlockPlacement checks the nginx-rules block lands right after
// every content server's server_name line, in both templates.
func TestRenderWAFBlockPlacement(t *testing.T) {
	site := store.Site{
		Domain:     "example.com",
		Root:       "/www/wwwroot/example.com",
		PHPVersion: "none",
		WAFEnabled: true,
		Subdomains: []store.Subdomain{{Name: "blog"}},
	}
	conf := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	if got := strings.Count(conf, "# clouddeck waf"); got != 2 {
		t.Errorf("non-SSL WAF blocks = %d, want 2 (main + subdomain):\n%s", got, conf)
	}
	assertContains(t, conf,
		"server_name example.com www.example.com;\n    # clouddeck waf\n",
		"server_name blog.example.com;\n    # clouddeck waf\n",
		"location ^~ /.well-known/acme-challenge/ { allow all; }",
		`location ~ /\.(?!well-known) { deny all; }`,
		`if ($request_uri ~* "(\.env|\.git/|\.svn/|\.htaccess|\.htpasswd|\.user\.ini|wp-config\.php\.(bak|old|save|txt))") { return 403; }`,
		`if ($query_string ~* "(<script|%3Cscript|union[ ]+select|%20union|concat\(|base64_|%2e%2e%2f|\.\./\.\.)") { return 403; }`,
	)

	ssl := site
	ssl.SSL = store.SSL{Enabled: true}
	conf = RenderNginxConfig(ssl, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock")
	// The 443 content server and the subdomain server get the block; the plain
	// port-80 redirect server may skip it.
	if got := strings.Count(conf, "# clouddeck waf"); got != 2 {
		t.Errorf("SSL WAF blocks = %d, want 2 (443 main + subdomain):\n%s", got, conf)
	}
	assertContains(t, conf,
		"listen [::]:443 ssl http2;\n    server_name example.com www.example.com;\n    # clouddeck waf\n",
		"server_name blog.example.com;\n    # clouddeck waf\n",
	)

	// WAF-disabled sites keep the v0.1 output.
	site.WAFEnabled = false
	if conf := RenderNginxConfig(site, "/var/log/nginx", "/run/php/php{{version}}-fpm.sock"); strings.Contains(conf, "clouddeck waf") {
		t.Errorf("disabled site rendered a WAF block:\n%s", conf)
	}
}

// TestSetWAFNginxRules covers the toggle flow on a server without modsecurity:
// render on, no-op on an unchanged flag, render off, state and audit trail.
func TestSetWAFNginxRules(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	info, err := h.svc.GetWAF("example.com")
	if err != nil {
		t.Fatalf("GetWAF: %v", err)
	}
	if info.Enabled || info.Engine != WAFEngineNginxRules || info.Note != wafNoteNginxRules {
		t.Fatalf("GetWAF = %+v, want disabled %s with its note", info, WAFEngineNginxRules)
	}

	info, err = h.svc.SetWAF("example.com", true)
	if err != nil {
		t.Fatalf("SetWAF(true): %v", err)
	}
	if !info.Enabled || info.Engine != WAFEngineNginxRules {
		t.Fatalf("SetWAF(true) = %+v, want enabled nginx-rules", info)
	}
	if got, _ := h.st.GetSite("example.com"); !got.WAFEnabled {
		t.Errorf("site.WAFEnabled = false after enable")
	}
	assertContains(t, h.conf("example.com"), "# clouddeck waf")
	assertContains(t, h.auditLog(), `"action":"site.waf.set"`, `"enabled":true`, `"result":"accepted"`)

	// An unchanged flag is a no-op: removing the rendered config proves no
	// re-render happens.
	confPath := filepath.Join(h.cfg.NginxSitesDir, "example.com.conf")
	if err := os.Remove(confPath); err != nil {
		t.Fatalf("remove conf: %v", err)
	}
	if _, err := h.svc.SetWAF("example.com", true); err != nil {
		t.Fatalf("SetWAF(true) again: %v", err)
	}
	if _, err := os.Stat(confPath); !os.IsNotExist(err) {
		t.Errorf("config re-rendered for an unchanged WAF flag: %v", err)
	}

	info, err = h.svc.SetWAF("example.com", false)
	if err != nil {
		t.Fatalf("SetWAF(false): %v", err)
	}
	if info.Enabled {
		t.Errorf("SetWAF(false) = %+v, want disabled", info)
	}
	if got, _ := h.st.GetSite("example.com"); got.WAFEnabled {
		t.Errorf("site.WAFEnabled = true after disable")
	}
	if conf := h.conf("example.com"); strings.Contains(conf, "clouddeck waf") {
		t.Errorf("config still contains the WAF block after disable:\n%s", conf)
	}
	assertContains(t, h.auditLog(), `"enabled":false`)
}

// TestSetWAFModSecurityEngine covers the module path: modsecurity directives in
// the vhost and a demo rules file created only when missing.
func TestSetWAFModSecurityEngine(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake nginx scripts require a POSIX shell")
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "nginx-modsecurity")
	writeExecScript(t, bin, `echo "nginx version: nginx/1.24.0 (Ubuntu)"; echo "configure arguments: --add-module=/usr/lib/nginx/modules/ngx_http_modsecurity_module.so"`)
	modsecConf := filepath.Join(dir, "modsec", "clouddeck.conf")
	h := newHarness(t, func(cfg *config.Config) {
		cfg.NginxBin = bin
		cfg.ModsecConf = modsecConf
	})
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	info, err := h.svc.GetWAF("example.com")
	if err != nil {
		t.Fatalf("GetWAF: %v", err)
	}
	if info.Enabled || info.Engine != WAFEngineModSecurity || info.Note != wafNoteModSecurity {
		t.Fatalf("GetWAF = %+v, want disabled modsecurity with its note", info)
	}

	info, err = h.svc.SetWAF("example.com", true)
	if err != nil {
		t.Fatalf("SetWAF(true): %v", err)
	}
	if !info.Enabled || info.Engine != WAFEngineModSecurity {
		t.Fatalf("SetWAF(true) = %+v, want enabled modsecurity", info)
	}
	conf := h.conf("example.com")
	assertContains(t, conf,
		"server_name example.com www.example.com;\n    # clouddeck waf (modsecurity)\n",
		"modsecurity on;",
		"modsecurity_rules_file "+modsecConf+";",
	)
	if strings.Contains(conf, "location ^~ /.well-known") {
		t.Errorf("nginx-rules block rendered with the modsecurity engine:\n%s", conf)
	}

	rules, err := os.ReadFile(modsecConf)
	if err != nil {
		t.Fatalf("read modsecurity rules file: %v", err)
	}
	assertContains(t, string(rules), "SecRuleEngine On", "SecRule ")

	// An existing rules file is never overwritten.
	if err := os.WriteFile(modsecConf, []byte("# custom rules\n"), 0o644); err != nil {
		t.Fatalf("seed custom rules: %v", err)
	}
	if _, err := h.svc.SetWAF("example.com", false); err != nil {
		t.Fatalf("SetWAF(false): %v", err)
	}
	if _, err := h.svc.SetWAF("example.com", true); err != nil {
		t.Fatalf("SetWAF(true) again: %v", err)
	}
	rules, _ = os.ReadFile(modsecConf)
	if string(rules) != "# custom rules\n" {
		t.Errorf("existing modsecurity rules file overwritten: %q", rules)
	}
}

// TestSetWAFRollbackWhenNginxFails mirrors SetPHPVersion: a failed render
// restores both the persisted flag and the previous config.
func TestSetWAFRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	_, err := h.svc.SetWAF("example.com", true)
	wantAPIError(t, err, 500, "internal")
	if got, _ := h.st.GetSite("example.com"); got.WAFEnabled {
		t.Errorf("site.WAFEnabled = true after failed render")
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render")
	}
}

func TestSetWAFDryRunAndUnknownDomain(t *testing.T) {
	h := newHarness(t, func(cfg *config.Config) { cfg.DryRun = true })
	h.addSite("example.com", "none")

	_, err := h.svc.SetWAF("example.com", true)
	wantAPIError(t, err, 409, "dry_run")

	// Reads keep working in dry-run.
	if info, err := h.svc.GetWAF("example.com"); err != nil || info.Enabled {
		t.Errorf("GetWAF in dry-run = %+v, %v", info, err)
	}

	other := newHarness(t, nil)
	_, err = other.svc.GetWAF("nope.example")
	wantAPIError(t, err, 404, "site_not_found")
	_, err = other.svc.SetWAF("nope.example", true)
	wantAPIError(t, err, 404, "site_not_found")
	_, err = other.svc.SetWAF("bad_domain", true)
	wantAPIError(t, err, 400, "invalid_domain")
}
