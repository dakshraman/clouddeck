package ssl

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	stdlog "log"
	"math/big"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"text/template"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
)

// PanelSSLStatus describes the current panel TLS posture and reverse-proxy status.
type PanelSSLStatus struct {
	Enabled      bool   `json:"enabled"`
	Type         string `json:"type"` // "self-signed", "letsencrypt", "custom", "none"
	Domain       string `json:"domain,omitempty"`
	Issuer       string `json:"issuer,omitempty"`
	ExpiresAt    string `json:"expiresAt,omitempty"`
	Subject      string `json:"subject,omitempty"`
	Port         int    `json:"port"`
	CookieSecure bool   `json:"cookieSecure"`
}

// PanelSSLInstallRequest contains parameters to issue or apply an SSL certificate.
type PanelSSLInstallRequest struct {
	Type   string `json:"type"` // "self-signed", "letsencrypt", "custom"
	Domain string `json:"domain,omitempty"`
	Email  string `json:"email,omitempty"`
	Cert   string `json:"cert,omitempty"`
	Key    string `json:"key,omitempty"`
}

type panelSSLMetadata struct {
	Enabled      bool   `json:"enabled"`
	Type         string `json:"type"`
	Domain       string `json:"domain,omitempty"`
	Issuer       string `json:"issuer,omitempty"`
	ExpiresAt    string `json:"expiresAt,omitempty"`
	Subject      string `json:"subject,omitempty"`
	Port         int    `json:"port,omitempty"`
	CookieSecure bool   `json:"cookieSecure,omitempty"`
	UpdatedAt    string `json:"updatedAt,omitempty"`
}

const panelNginxTemplate = `server {
    listen {{.Port}} ssl http2;
    listen [::]:{{.Port}} ssl http2;
    server_name _;
    ssl_certificate {{.CertPath}};
    ssl_certificate_key {{.KeyPath}};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    client_max_body_size 100m;
    error_page 497 301 https://$host:{{.Port}}$request_uri;
    location / {
        proxy_pass http://127.0.0.1:{{.InternalPort}};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
`

// PanelSSL manages SSL termination for the CloudDeck panel.
type PanelSSL struct {
	cfg config.Config
}

// NewPanelSSL constructs a new PanelSSL engine with the provided config.
func NewPanelSSL(cfg config.Config) *PanelSSL {
	return &PanelSSL{cfg: cfg}
}

// GetPanelSSLStatus inspects the panel certificate, nginx configuration, and environment file.
func (p *PanelSSL) GetPanelSSLStatus() (PanelSSLStatus, error) {
	status := PanelSSLStatus{
		Enabled:      false,
		Type:         "none",
		Port:         p.cfg.PanelPort,
		CookieSecure: isCookieSecure(p.cfg.PanelEnvFile),
	}

	certPath := filepath.Join(p.cfg.PanelSSLDir, "panel.crt")
	if fileExists(certPath) {
		if cert, err := parseCertFile(certPath); err == nil && cert != nil {
			status.Issuer = certCommonOrString(cert.Issuer)
			status.Subject = certCommonOrString(cert.Subject)
			status.ExpiresAt = cert.NotAfter.UTC().Format(time.RFC3339)
			if len(cert.DNSNames) > 0 {
				status.Domain = cert.DNSNames[0]
			}
		}
	}

	confExists := fileExists(p.cfg.PanelNginxConf)
	if confExists && status.ExpiresAt != "" {
		meta, _ := p.readMetadata()
		if meta != nil && !meta.Enabled {
			status.Enabled = false
			status.Type = "none"
		} else {
			status.Enabled = true
			if meta != nil && meta.Type != "" {
				status.Type = meta.Type
				if meta.Domain != "" {
					status.Domain = meta.Domain
				}
			} else {
				status.Type = deduceSSLType(status.Issuer, status.Subject)
			}
		}
	} else {
		status.Enabled = false
		status.Type = "none"
	}

	return status, nil
}

// InstallPanelSSL generates or verifies certificate material, provisions nginx, and reconfigures the panel.
func (p *PanelSSL) InstallPanelSSL(ctx context.Context, req PanelSSLInstallRequest) (PanelSSLStatus, error) {
	reqType := strings.ToLower(strings.TrimSpace(req.Type))
	switch reqType {
	case "self-signed", "letsencrypt", "custom":
	default:
		return PanelSSLStatus{}, apierr.BadRequest("invalid_ssl_type", fmt.Sprintf("unsupported SSL type %q; must be self-signed, letsencrypt, or custom", req.Type))
	}

	if err := os.MkdirAll(p.cfg.PanelSSLDir, 0755); err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("create ssl dir: %v", err))
	}

	certPath := filepath.Join(p.cfg.PanelSSLDir, "panel.crt")
	keyPath := filepath.Join(p.cfg.PanelSSLDir, "panel.key")

	switch reqType {
	case "self-signed":
		if err := p.generateSelfSigned(req, certPath, keyPath); err != nil {
			return PanelSSLStatus{}, err
		}

	case "letsencrypt":
		domain := strings.TrimSpace(req.Domain)
		if domain == "" {
			return PanelSSLStatus{}, apierr.BadRequest("missing_domain", "domain name is required for Let's Encrypt")
		}
		email := strings.TrimSpace(req.Email)
		if email == "" || !validEmail(email) {
			return PanelSSLStatus{}, apierr.BadRequest("invalid_email", fmt.Sprintf("invalid email %q", email))
		}

		if !p.cfg.DryRun {
			if _, err := exec.LookPath("certbot"); err != nil {
				return PanelSSLStatus{}, apierr.BadRequest("certbot_not_found", "certbot is not installed on this server")
			}
			cmd := exec.CommandContext(ctx, "certbot", "certonly", "--standalone", "--non-interactive", "--agree-tos", "-m", email, "-d", domain)
			out, err := cmd.CombinedOutput()
			if err != nil {
				webroot := p.cfg.Webroot
				if webroot == "" {
					webroot = "/var/www/html"
				}
				cmdWebroot := exec.CommandContext(ctx, "certbot", "certonly", "--webroot", "-w", webroot, "--non-interactive", "--agree-tos", "-m", email, "-d", domain)
				out2, err2 := cmdWebroot.CombinedOutput()
				if err2 != nil {
					return PanelSSLStatus{}, apierr.BadRequest("certbot_failed", fmt.Sprintf("certbot failed: %s; %s", strings.TrimSpace(string(out)), strings.TrimSpace(string(out2))))
				}
			}

			liveDir := filepath.Join("/etc/letsencrypt/live", domain)
			fullchain := filepath.Join(liveDir, "fullchain.pem")
			privkey := filepath.Join(liveDir, "privkey.pem")

			if err := copyFile(fullchain, certPath, 0644); err != nil {
				return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("copy fullchain.pem: %v", err))
			}
			if err := copyFile(privkey, keyPath, 0600); err != nil {
				return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("copy privkey.pem: %v", err))
			}
		} else {
			// Dry-run mode: check if live certs exist; otherwise generate a mock Let's Encrypt certificate
			liveDir := filepath.Join("/etc/letsencrypt/live", domain)
			fullchain := filepath.Join(liveDir, "fullchain.pem")
			privkey := filepath.Join(liveDir, "privkey.pem")
			if fileExists(fullchain) && fileExists(privkey) {
				_ = copyFile(fullchain, certPath, 0644)
				_ = copyFile(privkey, keyPath, 0600)
			} else {
				if err := p.generateMockLetsEncrypt(domain, certPath, keyPath); err != nil {
					return PanelSSLStatus{}, err
				}
			}
		}

	case "custom":
		certData := []byte(strings.TrimSpace(req.Cert))
		keyData := []byte(strings.TrimSpace(req.Key))
		if len(certData) == 0 || len(keyData) == 0 {
			return PanelSSLStatus{}, apierr.BadRequest("missing_cert_or_key", "both certificate and private key are required for custom SSL")
		}
		if _, err := tls.X509KeyPair(certData, keyData); err != nil {
			return PanelSSLStatus{}, apierr.BadRequest("invalid_ssl_pair", fmt.Sprintf("invalid certificate or private key pair: %v", err))
		}
		if err := os.WriteFile(keyPath, keyData, 0600); err != nil {
			return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("write key file: %v", err))
		}
		if err := os.WriteFile(certPath, certData, 0644); err != nil {
			return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("write cert file: %v", err))
		}
	}

	cert, err := parseCertFile(certPath)
	if err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("parse certificate: %v", err))
	}
	issuer := certCommonOrString(cert.Issuer)
	subject := certCommonOrString(cert.Subject)
	expiresAt := cert.NotAfter.UTC().Format(time.RFC3339)
	domain := strings.TrimSpace(req.Domain)
	if domain == "" && len(cert.DNSNames) > 0 {
		domain = cert.DNSNames[0]
	}
	if domain == "" {
		domain = subject
	}

	meta := panelSSLMetadata{
		Enabled:      true,
		Type:         reqType,
		Domain:       domain,
		Issuer:       issuer,
		ExpiresAt:    expiresAt,
		Subject:      subject,
		Port:         p.cfg.PanelPort,
		CookieSecure: true,
		UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
	}
	metaBytes, _ := json.MarshalIndent(meta, "", "  ")
	_ = os.WriteFile(filepath.Join(p.cfg.PanelSSLDir, "panel_ssl.json"), metaBytes, 0644)

	tmpl, err := template.New("panel_nginx").Parse(panelNginxTemplate)
	if err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("parse nginx template: %v", err))
	}
	var buf bytes.Buffer
	tmplData := struct {
		Port         int
		InternalPort int
		CertPath     string
		KeyPath      string
	}{
		Port:         p.cfg.PanelPort,
		InternalPort: p.cfg.PanelInternalPort,
		CertPath:     certPath,
		KeyPath:      keyPath,
	}
	if err := tmpl.Execute(&buf, tmplData); err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("render nginx template: %v", err))
	}

	if err := os.MkdirAll(filepath.Dir(p.cfg.PanelNginxConf), 0755); err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("create nginx config dir: %v", err))
	}
	if err := os.WriteFile(p.cfg.PanelNginxConf, buf.Bytes(), 0644); err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("write nginx config: %v", err))
	}

	if !p.cfg.DryRun {
		nginxBin := p.cfg.NginxBin
		if nginxBin == "" {
			nginxBin = "nginx"
		}
		cmd := exec.CommandContext(ctx, nginxBin, "-t")
		if out, err := cmd.CombinedOutput(); err != nil {
			_ = os.Remove(p.cfg.PanelNginxConf)
			return PanelSSLStatus{}, apierr.BadRequest("invalid_nginx_conf", fmt.Sprintf("nginx configuration test failed: %s (%v)", strings.TrimSpace(string(out)), err))
		}
	}

	envUpdates := map[string]string{
		"PORT":                strconv.Itoa(p.cfg.PanelInternalPort),
		"HOSTNAME":            "127.0.0.1",
		"PANEL_COOKIE_SECURE": "true",
	}
	if err := updateEnvFile(p.cfg.PanelEnvFile, envUpdates); err != nil {
		return PanelSSLStatus{}, apierr.Internal(fmt.Sprintf("update panel env file: %v", err))
	}

	if !p.cfg.DryRun {
		if err := p.reloadNginx(ctx); err != nil {
			stdlog.Printf("panel_ssl: reload nginx: %v", err)
		}
		if err := p.restartPanel(ctx); err != nil {
			stdlog.Printf("panel_ssl: restart panel: %v", err)
		}
	}

	return PanelSSLStatus{
		Enabled:      true,
		Type:         reqType,
		Domain:       domain,
		Issuer:       issuer,
		ExpiresAt:    expiresAt,
		Subject:      subject,
		Port:         p.cfg.PanelPort,
		CookieSecure: true,
	}, nil
}

// DisablePanelSSL removes the reverse-proxy vhost, updates panel.env, and updates metadata.
func (p *PanelSSL) DisablePanelSSL(ctx context.Context) error {
	_ = os.Remove(p.cfg.PanelNginxConf)

	envUpdates := map[string]string{
		"PORT":                strconv.Itoa(p.cfg.PanelPort),
		"HOSTNAME":            "0.0.0.0",
		"PANEL_COOKIE_SECURE": "false",
	}
	if err := updateEnvFile(p.cfg.PanelEnvFile, envUpdates); err != nil {
		return apierr.Internal(fmt.Sprintf("update panel env file: %v", err))
	}

	if !p.cfg.DryRun {
		if err := p.reloadNginx(ctx); err != nil {
			stdlog.Printf("panel_ssl: reload nginx: %v", err)
		}
		if err := p.restartPanel(ctx); err != nil {
			stdlog.Printf("panel_ssl: restart panel: %v", err)
		}
	}

	metaPath := filepath.Join(p.cfg.PanelSSLDir, "panel_ssl.json")
	if meta, err := p.readMetadata(); err == nil && meta != nil {
		meta.Enabled = false
		meta.CookieSecure = false
		meta.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if b, err := json.MarshalIndent(meta, "", "  "); err == nil {
			_ = os.WriteFile(metaPath, b, 0644)
		}
	} else {
		emptyMeta := panelSSLMetadata{
			Enabled:      false,
			Type:         "none",
			Port:         p.cfg.PanelPort,
			CookieSecure: false,
			UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
		}
		if b, err := json.MarshalIndent(emptyMeta, "", "  "); err == nil {
			_ = os.WriteFile(metaPath, b, 0644)
		}
	}

	return nil
}

func (p *PanelSSL) generateSelfSigned(req PanelSSLInstallRequest, certPath, keyPath string) error {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("generate rsa key: %v", err))
	}

	ipMap := make(map[string]net.IP)
	ipMap["127.0.0.1"] = net.ParseIP("127.0.0.1")
	ipMap["::1"] = net.ParseIP("::1")

	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil && !ip.IsUnspecified() {
				ipMap[ip.String()] = ip
			}
		}
	}

	dnsMap := make(map[string]bool)
	dnsMap["localhost"] = true
	if host, err := os.Hostname(); err == nil && host != "" {
		dnsMap[host] = true
	}

	domain := strings.TrimSpace(req.Domain)
	if domain != "" {
		if parsedIP := net.ParseIP(domain); parsedIP != nil {
			ipMap[parsedIP.String()] = parsedIP
		} else {
			dnsMap[domain] = true
		}
	}

	var ips []net.IP
	for _, ip := range ipMap {
		ips = append(ips, ip)
	}

	var dnsNames []string
	for d := range dnsMap {
		dnsNames = append(dnsNames, d)
	}
	sort.Strings(dnsNames)

	cn := domain
	if cn == "" {
		if h, err := os.Hostname(); err == nil && h != "" {
			cn = h
		} else {
			cn = "CloudDeck Panel"
		}
	}

	serialNumLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNum, err := rand.Int(rand.Reader, serialNumLimit)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("generate serial number: %v", err))
	}

	template := x509.Certificate{
		SerialNumber: serialNum,
		Subject: pkix.Name{
			CommonName:   cn,
			Organization: []string{"CloudDeck"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().AddDate(1, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           ips,
		DNSNames:              dnsNames,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("create certificate: %v", err))
	}

	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	})
	certPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: derBytes,
	})

	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return apierr.Internal(fmt.Sprintf("write key file: %v", err))
	}
	if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
		return apierr.Internal(fmt.Sprintf("write cert file: %v", err))
	}
	return nil
}

func (p *PanelSSL) generateMockLetsEncrypt(domain, certPath, keyPath string) error {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("generate rsa key: %v", err))
	}

	caTemplate := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName:   "Let's Encrypt Authority",
			Organization: []string{"Let's Encrypt"},
		},
		NotBefore: time.Now().Add(-1 * time.Hour),
		NotAfter:  time.Now().AddDate(0, 3, 0),
		IsCA:      true,
		KeyUsage:  x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
	}

	serialNumLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNum, err := rand.Int(rand.Reader, serialNumLimit)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("generate serial number: %v", err))
	}

	template := x509.Certificate{
		SerialNumber: serialNum,
		Subject: pkix.Name{
			CommonName:   domain,
			Organization: []string{"Let's Encrypt"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().AddDate(0, 3, 0), // 90 days validity
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{domain},
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &caTemplate, &priv.PublicKey, priv)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("create certificate: %v", err))
	}

	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	})
	certPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: derBytes,
	})

	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return apierr.Internal(fmt.Sprintf("write key file: %v", err))
	}
	if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
		return apierr.Internal(fmt.Sprintf("write cert file: %v", err))
	}
	return nil
}

func (p *PanelSSL) readMetadata() (*panelSSLMetadata, error) {
	metaPath := filepath.Join(p.cfg.PanelSSLDir, "panel_ssl.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, err
	}
	var meta panelSSLMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

func (p *PanelSSL) reloadNginx(ctx context.Context) error {
	if p.cfg.DryRun {
		return nil
	}
	if p.cfg.NginxRestartCmd != "" {
		fields := strings.Fields(p.cfg.NginxRestartCmd)
		if len(fields) > 0 {
			cmd := exec.CommandContext(ctx, fields[0], fields[1:]...)
			return cmd.Run()
		}
		return nil
	}
	if err := exec.CommandContext(ctx, "systemctl", "reload", "nginx").Run(); err != nil {
		nginxBin := p.cfg.NginxBin
		if nginxBin == "" {
			nginxBin = "nginx"
		}
		return exec.CommandContext(ctx, nginxBin, "-s", "reload").Run()
	}
	return nil
}

func (p *PanelSSL) restartPanel(ctx context.Context) error {
	if p.cfg.DryRun || p.cfg.PanelRestartCmd == "" {
		return nil
	}
	fields := strings.Fields(p.cfg.PanelRestartCmd)
	if len(fields) == 0 {
		return nil
	}
	cmd := exec.CommandContext(ctx, fields[0], fields[1:]...)
	return cmd.Run()
}

// Package-level helpers for direct calls.

func GetPanelSSLStatus(cfg config.Config) (PanelSSLStatus, error) {
	return NewPanelSSL(cfg).GetPanelSSLStatus()
}

func InstallPanelSSL(ctx context.Context, cfg config.Config, req PanelSSLInstallRequest) (PanelSSLStatus, error) {
	return NewPanelSSL(cfg).InstallPanelSSL(ctx, req)
}

func DisablePanelSSL(ctx context.Context, cfg config.Config) error {
	return NewPanelSSL(cfg).DisablePanelSSL(ctx)
}

func parseCertFile(path string) (*x509.Certificate, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, errors.New("no PEM certificate data found")
	}
	return x509.ParseCertificate(block.Bytes)
}

func certCommonOrString(name pkix.Name) string {
	if name.CommonName != "" {
		return name.CommonName
	}
	return name.String()
}

func deduceSSLType(issuer, subject string) string {
	lowerIssuer := strings.ToLower(issuer)
	if strings.Contains(lowerIssuer, "let's encrypt") || strings.Contains(lowerIssuer, "letsencrypt") {
		return "letsencrypt"
	}
	if issuer == subject || strings.Contains(lowerIssuer, "clouddeck") || strings.Contains(lowerIssuer, "self-signed") {
		return "self-signed"
	}
	return "custom"
}

func isCookieSecure(filePath string) bool {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return false
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}
		k, v, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		if strings.TrimSpace(k) == "PANEL_COOKIE_SECURE" {
			val := strings.Trim(strings.TrimSpace(v), `"'`)
			return strings.EqualFold(val, "true") || val == "1"
		}
	}
	return false
}

func updateEnvFile(filePath string, updates map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return err
	}
	applied := make(map[string]bool)
	var newLines []string

	data, err := os.ReadFile(filePath)
	if err == nil {
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			line := scanner.Text()
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "#") || trimmed == "" {
				newLines = append(newLines, line)
				continue
			}
			k, _, found := strings.Cut(line, "=")
			if found {
				key := strings.TrimSpace(k)
				if val, exists := updates[key]; exists {
					newLines = append(newLines, fmt.Sprintf("%s=%s", key, val))
					applied[key] = true
					continue
				}
			}
			newLines = append(newLines, line)
		}
		if err := scanner.Err(); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	var keys []string
	for k := range updates {
		if !applied[k] {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	for _, k := range keys {
		newLines = append(newLines, fmt.Sprintf("%s=%s", k, updates[k]))
	}

	content := strings.Join(newLines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return os.WriteFile(filePath, []byte(content), 0600)
}

func fileExists(path string) bool {
	if path == "" {
		return false
	}
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

func copyFile(src, dst string, mode os.FileMode) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, mode)
}
