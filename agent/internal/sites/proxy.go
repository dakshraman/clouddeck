package sites

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"text/template"

	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/store"
)

// AppLister is the subset of the apps service that nginx rendering needs.
// Declaring it here keeps the sites package free of an apps import cycle.
type AppLister interface {
	ProxyFor(site string) []store.App
	DeleteForSite(ctx context.Context, log safeexec.Logger, site string) error
}

// appProxy is one supervised app behind a site's vhost.
type appProxy struct {
	Name string
	Port int
}

// ProxyTargets is the set of app proxies rendered into a vhost.
type ProxyTargets struct {
	Apps []appProxy
}

// HasProxy reports whether any app is behind the site.
func (p ProxyTargets) HasProxy() bool { return len(p.Apps) > 0 }

// proxyBlock is shared by the HTTP and HTTPS templates. When a site has no
// apps it renders nothing, keeping static/PHP configs byte-identical.
//
// App hosting is path-prefixed: /<name>/ proxies to 127.0.0.1:<port> with the
// prefix stripped. A site with exactly one app also mounts it at /, so a
// single-app site behaves like a normal website.
const proxyBlock = `{{define "proxy"}}{{if or .Proxies.HasProxy .RootProxy}}{{range .Proxies.Apps}}
    # clouddeck app: {{.Name}}
    location = /{{.Name}} {
        return 308 /{{.Name}}/$is_args$args;
    }
    location /{{.Name}}/ {
        proxy_pass http://127.0.0.1:{{.Port}}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
{{end}}{{if .RootProxy}}
    # clouddeck app: primary upstream at /
    location / {
        proxy_pass http://127.0.0.1:{{.RootProxy}}/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
{{end}}{{end}}{{end}}`

var appProxyTemplate = template.Must(template.New("app-proxy").Parse(proxyBlock))

// renderProxyBlock renders the proxy fragment for a site's apps.
func renderProxyBlock(proxies ProxyTargets, rootProxy int) string {
	data := struct {
		Proxies   ProxyTargets
		RootProxy int
	}{Proxies: proxies, RootProxy: rootProxy}
	var b bytes.Buffer
	_ = appProxyTemplate.ExecuteTemplate(&b, "proxy", data)
	return b.String()
}

// proxyTargets resolves the proxy targets for one site. A site with a single
// app mounts it at / (the normal website case); a site with several apps gives
// each one a /<name>/ prefix and leaves / to the static webroot.
func (s *Service) proxyTargets(site string) (ProxyTargets, int) {
	if s.apps == nil {
		return ProxyTargets{}, 0
	}
	list := s.apps.ProxyFor(site)
	if len(list) == 1 {
		return ProxyTargets{}, list[0].Port
	}
	targets := ProxyTargets{Apps: make([]appProxy, 0, len(list))}
	for _, app := range list {
		targets.Apps = append(targets.Apps, appProxy{Name: app.Name, Port: app.Port})
	}
	return targets, 0
}

// ConfigureProxy ensures a site exists and applies an nginx reverse proxy to the given upstream port.
func (s *Service) ConfigureProxy(ctx context.Context, domain string, port int) error {
	cleanDomain, err := ValidateDomain(domain)
	if err != nil {
		return err
	}
	site, ok := s.st.GetSite(cleanDomain)
	if !ok {
		now := store.Now()
		site = store.Site{
			Domain:     cleanDomain,
			Root:       s.rootFor(cleanDomain),
			PHPVersion: "none",
			SSL:        store.SSL{Enabled: false},
			Status:     store.SiteActive,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := s.st.CreateSite(site); err != nil && !errors.Is(err, store.ErrExists) {
			return err
		}
	}
	confPath := s.confPath(site.Domain)
	if s.cfg.DryRun {
		_ = os.MkdirAll(filepath.Dir(confPath), 0o755)
	} else {
		_ = os.MkdirAll(s.cfg.LogDir, 0o755)
	}
	engine := ""
	if site.WAFEnabled {
		engine = detectWAFEngine(s.cfg)
	}
	conf := renderNginxConfigWithApps(site, s.cfg.LogDir, "", engine, s.cfg.ModsecConf, ProxyTargets{}, port)
	if err := os.WriteFile(confPath, []byte(conf), 0o644); err != nil {
		return fmt.Errorf("write nginx config %s: %w", confPath, err)
	}
	if !s.cfg.DryRun {
		if err := safeexec.Run(ctx, s.cfg.DryRun, func(string, string) {}, "nginx", "-t"); err != nil {
			return fmt.Errorf("nginx -t: %w", err)
		}
		_ = s.reload(ctx, func(string, string) {})
	}
	return nil
}
