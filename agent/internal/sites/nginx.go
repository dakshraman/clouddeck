package sites

import (
	"bytes"
	"text/template"

	"clouddeck/agent/internal/store"
)

// managedMarker identifies configs owned by the agent.
const managedMarker = "# managed-by: clouddeck"

type nginxData struct {
	Domain string
	Root   string
	PHP    string // empty for static sites
	LogDir string
}

// RenderNginxConfig renders the site's nginx config. With SSL enabled it emits
// an 80 -> 443 redirect block plus an HTTPS server block.
func RenderNginxConfig(site store.Site, logDir string) string {
	data := nginxData{Domain: site.Domain, Root: site.Root, LogDir: logDir}
	if site.PHPVersion != "" && site.PHPVersion != "none" {
		data.PHP = site.PHPVersion
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

    location / {
        try_files $uri $uri/ =404;
    }
{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php{{.PHP}}-fpm.sock;
    }
{{end}}}
`))

var nginxSSLTemplate = template.Must(template.New("nginx-ssl").Parse(managedMarker + "\n" + `server {
    listen 80;
    listen [::]:80;
    server_name {{.Domain}} www.{{.Domain}};
    return 301 https://$host$request_uri;
}

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

    location / {
        try_files $uri $uri/ =404;
    }
{{if .PHP}}
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php{{.PHP}}-fpm.sock;
    }
{{end}}}
`))
