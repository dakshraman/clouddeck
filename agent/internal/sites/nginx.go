package sites

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"clouddeck/agent/internal/store"
)

// managedMarker identifies configs owned by the agent.
const managedMarker = "# managed-by: clouddeck"

type nginxRedirect struct {
	From string
	To   string
	Code int // 301 for permanent rules, 302 otherwise
}

type nginxData struct {
	Domain       string
	Root         string
	SiteRoot     string
	PHP          string // empty for static sites
	LogDir       string
	FpmSock      string // resolved php-fpm socket (PHP sites only)
	Denies       []string
	Redirects    []nginxRedirect
	Subdomains   []string
	WAF          bool   // emit the CloudDeck WAF block (v0.5)
	WAFModSec    bool   // emit the modsecurity variant of the WAF block
	ModsecConf   string // modsecurity_rules_file target (modsecurity variant only)
	CacheEnabled bool   // emit FastCGI microcaching directives
	CacheTTL     string // cache TTL e.g. "10m", "1h"
	Proxies      ProxyTargets
	RootProxy    int // port of the primary app when it owns "/"
}

// RenderNginxConfig renders the site's nginx config. With SSL enabled it emits
// an 80 -> 443 redirect block plus an HTTPS server block. Every server block
// carries the site's redirect rules and denied IPs; each subdomain gets its
// own plain-HTTP server block rooted at <root>/<name>. logDir is where site
// logs are written; fpmSock is the php-fpm socket for the site's PHP version
// (a literal `{{version}}` placeholder is still substituted for convenience).
// A WAF-enabled site gets the CloudDeck nginx-rules block; use
// renderNginxConfig to pick the modsecurity variant.
func RenderNginxConfig(site store.Site, logDir, fpmSock string) string {
	return renderNginxConfig(site, logDir, fpmSock, "", "")
}

// renderNginxConfig renders the config for one WAF engine: the nginx-rules
// block unless wafEngine is WAFEngineModSecurity, which switches the WAF block
// to the module's server-level directives with modsecConf as the rules file.
func renderNginxConfig(site store.Site, logDir, fpmSock, wafEngine, modsecConf string) string {
	return renderNginxConfigWithApps(site, logDir, fpmSock, wafEngine, modsecConf, ProxyTargets{}, 0)
}

// renderNginxConfigWithApps also emits proxy blocks for a site's apps.
func renderNginxConfigWithApps(site store.Site, logDir, fpmSock, wafEngine, modsecConf string, proxies ProxyTargets, rootProxy int) string {
	rootDir := site.Root
	if site.Root != "" {
		if fi, err := os.Stat(filepath.Join(site.Root, "public")); err == nil && fi.IsDir() {
			rootDir = filepath.Join(site.Root, "public")
		}
	}
	data := nginxData{
		Domain:    site.Domain,
		Root:      rootDir,
		SiteRoot:  site.Root,
		LogDir:    logDir,
		Proxies:   proxies,
		RootProxy: rootProxy,
	}
	if site.PHPVersion != "" && site.PHPVersion != "none" {
		data.PHP = site.PHPVersion
		data.FpmSock = strings.ReplaceAll(fpmSock, "{{version}}", site.PHPVersion)
	}
	for _, ip := range site.BlockedIPs {
		data.Denies = append(data.Denies, ip.IP)
	}
	for _, r := range site.Redirects {
		code := 302
		if r.Permanent {
			code = 301
		}
		data.Redirects = append(data.Redirects, nginxRedirect{From: r.From, To: r.To, Code: code})
	}
	for _, sub := range site.Subdomains {
		data.Subdomains = append(data.Subdomains, sub.Name)
	}
	if site.WAFEnabled {
		data.WAF = true
		if wafEngine == WAFEngineModSecurity {
			data.WAFModSec = true
			data.ModsecConf = modsecConf
		}
	}
	if site.CacheEnabled {
		data.CacheEnabled = true
		data.CacheTTL = site.CacheTTL
		if data.CacheTTL == "" {
			data.CacheTTL = "10m"
		}
	}
	tpl := nginxTemplate
	if site.SSL.Enabled {
		tpl = nginxSSLTemplate
	}
	var b bytes.Buffer
	_ = tpl.Execute(&b, data)
	return b.String()
}

// wafBlock is the shared per-site WAF fragment. It is emitted directly after
// a content server block's server_name line; when the data has no WAF flag the
// fragment renders to nothing, keeping configs byte-identical to v0.1. The
// default variant is the CloudDeck rule set for servers without ModSecurity;
// WAFModSec switches to the module's server-level directives.
const wafBlock = `{{define "waf"}}{{if .WAF}}{{if .WAFModSec}}
    # clouddeck waf (modsecurity)
    modsecurity on;
    modsecurity_rules_file {{.ModsecConf}};{{else}}
    # clouddeck waf
    location ^~ /.well-known/acme-challenge/ { allow all; }
    location ~ /\.(?!well-known) { deny all; }
    if ($request_uri ~* "(\.env|\.git/|\.svn/|\.htaccess|\.htpasswd|\.user\.ini|wp-config\.php\.(bak|old|save|txt))") { return 403; }
    if ($query_string ~* "(<script|%3Cscript|union[ ]+select|%20union|concat\(|base64_|%2e%2e%2f|\.\./\.\.)") { return 403; }{{end}}{{end}}{{end}}`

const cacheBlock = `{{define "cache_rules"}}{{if .CacheEnabled}}
    # clouddeck fastcgi microcaching
    set $skip_cache 0;
    if ($request_method = POST) { set $skip_cache 1; }
    if ($query_string != "") { set $skip_cache 1; }
    if ($http_cookie ~* "comment_author|wordpress_[a-f0-9]+|wp-postpass|wordpress_no_cache|wordpress_logged_in|laravel_session|PHPSESSID") {
        set $skip_cache 1;
    }
    if ($request_uri ~* "/wp-admin/|/xmlrpc.php|wp-.*.php|/feed/|index.php|sitemap(_index)?.xml") {
        set $skip_cache 1;
    }
{{end}}{{end}}`

var nginxTemplate = template.Must(template.New("nginx").Parse(managedMarker + "\n" + wafBlock + cacheBlock + proxyBlock + `server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}} www.{{.Domain}};{{template "waf" .}}{{template "cache_rules" .}}
    root {{.Root}};
    index index.php index.html index.htm;

    client_max_body_size 100m;

    access_log {{.LogDir}}/{{.Domain}}.access.log;
    error_log {{.LogDir}}/{{.Domain}}.error.log;
{{range .Denies}}    deny {{.}};
{{end}}
{{if eq .RootProxy 0}}    location / {
{{if .PHP}}        try_files $uri $uri/ /index.php?$query_string /index.html =404;{{else}}        try_files $uri $uri/ /index.html =404;{{end}}
    }
{{end}}{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{template "proxy" .}}{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{.FpmSock}};{{if .CacheEnabled}}
        fastcgi_cache CLOUDDECK_CACHE;
        fastcgi_cache_valid 200 301 302 {{if .CacheTTL}}{{.CacheTTL}}{{else}}10m{{end}};
        fastcgi_cache_use_stale error timeout updating invalid_header http_500;
        fastcgi_cache_bypass $skip_cache;
        fastcgi_no_cache $skip_cache;
        add_header X-FastCGI-Cache $upstream_cache_status;{{end}}
    }
{{end}}}
{{range .Subdomains}}
server {
    listen 80;
    listen [::]:80;
    server_name {{.}}.{{$.Domain}};{{template "waf" $}}
    root {{$.SiteRoot}}/{{.}};
    index index.php index.html index.htm;

    client_max_body_size 100m;

    access_log {{$.LogDir}}/{{$.Domain}}.access.log;
    error_log {{$.LogDir}}/{{$.Domain}}.error.log;
{{range $.Denies}}    deny {{.}};
{{end}}
    location / {
{{if $.PHP}}        try_files $uri $uri/ /index.php?$query_string /index.html =404;{{else}}        try_files $uri $uri/ /index.html =404;{{end}}
    }
{{range $.Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{if $.PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{$.FpmSock}};
    }
{{end}}}
{{end}}`))

var nginxSSLTemplate = template.Must(template.New("nginx-ssl").Parse(managedMarker + "\n" + wafBlock + cacheBlock + proxyBlock + `server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}} www.{{.Domain}};
    return 301 https://$host$request_uri;
{{range .Denies}}    deny {{.}};
{{end}}{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {{.Domain}} www.{{.Domain}};{{template "waf" .}}{{template "cache_rules" .}}
    root {{.Root}};
    index index.php index.html index.htm;

    client_max_body_size 100m;

    ssl_certificate /etc/letsencrypt/live/{{.Domain}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{.Domain}}/privkey.pem;

    access_log {{.LogDir}}/{{.Domain}}.access.log;
    error_log {{.LogDir}}/{{.Domain}}.error.log;
{{range .Denies}}    deny {{.}};
{{end}}
{{if eq .RootProxy 0}}    location / {
{{if .PHP}}        try_files $uri $uri/ /index.php?$query_string /index.html =404;{{else}}        try_files $uri $uri/ /index.html =404;{{end}}
    }
{{end}}{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{template "proxy" .}}{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{.FpmSock}};{{if .CacheEnabled}}
        fastcgi_cache CLOUDDECK_CACHE;
        fastcgi_cache_valid 200 301 302 {{if .CacheTTL}}{{.CacheTTL}}{{else}}10m{{end}};
        fastcgi_cache_use_stale error timeout updating invalid_header http_500;
        fastcgi_cache_bypass $skip_cache;
        fastcgi_no_cache $skip_cache;
        add_header X-FastCGI-Cache $upstream_cache_status;{{end}}
    }
{{end}}}
{{range .Subdomains}}
server {
    listen 80;
    listen [::]:80;
    server_name {{.}}.{{$.Domain}};{{template "waf" $}}
    root {{$.SiteRoot}}/{{.}};
    index index.php index.html index.htm;

    client_max_body_size 100m;

    access_log {{$.LogDir}}/{{$.Domain}}.access.log;
    error_log {{$.LogDir}}/{{$.Domain}}.error.log;
{{range $.Denies}}    deny {{.}};
{{end}}
    location / {
{{if $.PHP}}        try_files $uri $uri/ /index.php?$query_string /index.html =404;{{else}}        try_files $uri $uri/ /index.html =404;{{end}}
    }
{{range $.Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{if $.PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{$.FpmSock}};
    }
{{end}}}
{{end}}`))
