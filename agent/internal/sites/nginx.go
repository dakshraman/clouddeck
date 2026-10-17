package sites

import (
	"bytes"
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
	Domain     string
	Root       string
	PHP        string // empty for static sites
	LogDir     string
	FpmSock    string // resolved php-fpm socket (PHP sites only)
	Denies     []string
	Redirects  []nginxRedirect
	Subdomains []string
}

// RenderNginxConfig renders the site's nginx config. With SSL enabled it emits
// an 80 -> 443 redirect block plus an HTTPS server block. Every server block
// carries the site's redirect rules and denied IPs; each subdomain gets its
// own plain-HTTP server block rooted at <root>/<name>. logDir is where site
// logs are written; fpmSock is the php-fpm socket for the site's PHP version
// (a literal `{{version}}` placeholder is still substituted for convenience).
func RenderNginxConfig(site store.Site, logDir, fpmSock string) string {
	data := nginxData{Domain: site.Domain, Root: site.Root, LogDir: logDir}
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
	tpl := nginxTemplate
	if site.SSL.Enabled {
		tpl = nginxSSLTemplate
	}
	var b bytes.Buffer
	_ = tpl.Execute(&b, data)
	return b.String()
}

var nginxTemplate = template.Must(template.New("nginx").Parse(managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}} www.{{.Domain}};
    root {{.Root}};
    index index.html index.php;

    access_log {{.LogDir}}/{{.Domain}}.access.log;
    error_log {{.LogDir}}/{{.Domain}}.error.log;
{{range .Denies}}    deny {{.}};
{{end}}
    location / {
        try_files $uri $uri/ =404;
    }
{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{.FpmSock}};
    }
{{end}}}
{{range .Subdomains}}
server {
    listen 80;
    listen [::]:80;
    server_name {{.}}.{{$.Domain}};
    root {{$.Root}}/{{.}};
    index index.html index.php;

    access_log {{$.LogDir}}/{{$.Domain}}.access.log;
    error_log {{$.LogDir}}/{{$.Domain}}.error.log;
{{range $.Denies}}    deny {{.}};
{{end}}
    location / {
        try_files $uri $uri/ =404;
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

var nginxSSLTemplate = template.Must(template.New("nginx-ssl").Parse(managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}} www.{{.Domain}};
    return 301 https://$host$request_uri;
{{range .Denies}}    deny {{.}};
{{end}}{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name {{.Domain}} www.{{.Domain}};
    root {{.Root}};
    index index.html index.php;

    ssl_certificate /etc/letsencrypt/live/{{.Domain}}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{.Domain}}/privkey.pem;

    access_log {{.LogDir}}/{{.Domain}}.access.log;
    error_log {{.LogDir}}/{{.Domain}}.error.log;
{{range .Denies}}    deny {{.}};
{{end}}
    location / {
        try_files $uri $uri/ =404;
    }
{{range .Redirects}}    location {{.From}} { return {{.Code}} {{.To}}; }
{{end}}{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:{{.FpmSock}};
    }
{{end}}}
{{range .Subdomains}}
server {
    listen 80;
    listen [::]:80;
    server_name {{.}}.{{$.Domain}};
    root {{$.Root}}/{{.}};
    index index.html index.php;

    access_log {{$.LogDir}}/{{$.Domain}}.access.log;
    error_log {{$.LogDir}}/{{$.Domain}}.error.log;
{{range $.Denies}}    deny {{.}};
{{end}}
    location / {
        try_files $uri $uri/ =404;
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
