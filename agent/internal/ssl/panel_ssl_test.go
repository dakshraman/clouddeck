package ssl

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
)

func testPanelSSLConfig(t *testing.T) config.Config {
	t.Helper()
	dir := t.TempDir()
	return config.Config{
		PanelEnvFile:      filepath.Join(dir, "panel.env"),
		PanelSSLDir:       filepath.Join(dir, "ssl"),
		PanelNginxConf:    filepath.Join(dir, "nginx", "clouddeck-panel.conf"),
		PanelPort:         2083,
		PanelInternalPort: 2082,
		DryRun:            true,
	}
}

func generateTestKeyPair(t *testing.T, domain string) (certPEM, keyPEM string) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(100),
		Subject: pkix.Name{
			CommonName:   domain,
			Organization: []string{"Test Org"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{domain},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		t.Fatalf("create test cert: %v", err)
	}

	keyBlock := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	})
	certBlock := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: der,
	})
	return string(certBlock), string(keyBlock)
}

func TestPanelSSLInitialStatus(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	mgr := NewPanelSSL(cfg)

	status, err := mgr.GetPanelSSLStatus()
	if err != nil {
		t.Fatalf("GetPanelSSLStatus error = %v", err)
	}
	if status.Enabled {
		t.Errorf("status.Enabled = true, want false")
	}
	if status.Type != "none" {
		t.Errorf("status.Type = %q, want none", status.Type)
	}
	if status.Port != 2083 {
		t.Errorf("status.Port = %d, want 2083", status.Port)
	}
	if status.CookieSecure {
		t.Errorf("status.CookieSecure = true, want false")
	}
}

func TestInstallPanelSSLSelfSigned(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	mgr := NewPanelSSL(cfg)
	ctx := context.Background()

	// Prepopulate panel.env with existing custom variable to ensure non-destructive update
	_ = os.MkdirAll(filepath.Dir(cfg.PanelEnvFile), 0755)
	_ = os.WriteFile(cfg.PanelEnvFile, []byte("EXISTING_KEY=secret_value\nPORT=2083\nHOSTNAME=0.0.0.0\n"), 0600)

	req := PanelSSLInstallRequest{
		Type:   "self-signed",
		Domain: "panel.example.local",
	}

	status, err := mgr.InstallPanelSSL(ctx, req)
	if err != nil {
		t.Fatalf("InstallPanelSSL error = %v", err)
	}

	if !status.Enabled {
		t.Errorf("status.Enabled = false, want true")
	}
	if status.Type != "self-signed" {
		t.Errorf("status.Type = %q, want self-signed", status.Type)
	}
	if status.Domain != "panel.example.local" {
		t.Errorf("status.Domain = %q, want panel.example.local", status.Domain)
	}
	if !status.CookieSecure {
		t.Errorf("status.CookieSecure = false, want true")
	}
	if status.Port != 2083 {
		t.Errorf("status.Port = %d, want 2083", status.Port)
	}

	// Verify key and cert permissions
	keyPath := filepath.Join(cfg.PanelSSLDir, "panel.key")
	certPath := filepath.Join(cfg.PanelSSLDir, "panel.crt")

	keyInfo, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("stat panel.key error: %v", err)
	}
	if keyInfo.Mode().Perm() != 0600 {
		t.Errorf("panel.key perms = %o, want 0600", keyInfo.Mode().Perm())
	}

	certInfo, err := os.Stat(certPath)
	if err != nil {
		t.Fatalf("stat panel.crt error: %v", err)
	}
	if certInfo.Mode().Perm() != 0644 {
		t.Errorf("panel.crt perms = %o, want 0644", certInfo.Mode().Perm())
	}

	// Verify parsed certificate SANs
	cert, err := parseCertFile(certPath)
	if err != nil {
		t.Fatalf("parse generated cert: %v", err)
	}
	found127 := false
	for _, ip := range cert.IPAddresses {
		if ip.Equal(net.ParseIP("127.0.0.1")) {
			found127 = true
			break
		}
	}
	if !found127 {
		t.Errorf("cert IPAddresses missing 127.0.0.1")
	}

	foundLocalhost := false
	foundDomain := false
	for _, d := range cert.DNSNames {
		if d == "localhost" {
			foundLocalhost = true
		}
		if d == "panel.example.local" {
			foundDomain = true
		}
	}
	if !foundLocalhost {
		t.Errorf("cert DNSNames missing localhost")
	}
	if !foundDomain {
		t.Errorf("cert DNSNames missing panel.example.local")
	}

	// Verify Nginx reverse proxy template contents
	nginxConfData, err := os.ReadFile(cfg.PanelNginxConf)
	if err != nil {
		t.Fatalf("read nginx conf error: %v", err)
	}
	confStr := string(nginxConfData)
	if !strings.Contains(confStr, "listen 2083 ssl http2;") {
		t.Errorf("nginx conf missing listen 2083 ssl http2")
	}
	if !strings.Contains(confStr, "proxy_pass http://127.0.0.1:2082;") {
		t.Errorf("nginx conf missing proxy_pass 127.0.0.1:2082")
	}
	if !strings.Contains(confStr, "error_page 497 301 https://$host:2083$request_uri;") {
		t.Errorf("nginx conf missing error_page 497 redirection")
	}
	if !strings.Contains(confStr, "ssl_certificate "+certPath+";") {
		t.Errorf("nginx conf missing ssl_certificate path")
	}

	// Verify panel.env updates
	envData, err := os.ReadFile(cfg.PanelEnvFile)
	if err != nil {
		t.Fatalf("read panel.env error: %v", err)
	}
	envStr := string(envData)
	if !strings.Contains(envStr, "PORT=2082") {
		t.Errorf("panel.env missing PORT=2082")
	}
	if !strings.Contains(envStr, "HOSTNAME=127.0.0.1") {
		t.Errorf("panel.env missing HOSTNAME=127.0.0.1")
	}
	if !strings.Contains(envStr, "PANEL_COOKIE_SECURE=true") {
		t.Errorf("panel.env missing PANEL_COOKIE_SECURE=true")
	}
	if !strings.Contains(envStr, "EXISTING_KEY=secret_value") {
		t.Errorf("panel.env wiped out existing variable EXISTING_KEY")
	}

	// Verify GetPanelSSLStatus reports enabled
	st, err := mgr.GetPanelSSLStatus()
	if err != nil {
		t.Fatalf("GetPanelSSLStatus error: %v", err)
	}
	if !st.Enabled || st.Type != "self-signed" || !st.CookieSecure {
		t.Errorf("unexpected status: %+v", st)
	}
}

func TestInstallPanelSSLCustom(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	mgr := NewPanelSSL(cfg)
	ctx := context.Background()

	certPEM, keyPEM := generateTestKeyPair(t, "custom.clouddeck.io")

	req := PanelSSLInstallRequest{
		Type:   "custom",
		Domain: "custom.clouddeck.io",
		Cert:   certPEM,
		Key:    keyPEM,
	}

	status, err := mgr.InstallPanelSSL(ctx, req)
	if err != nil {
		t.Fatalf("InstallPanelSSL error = %v", err)
	}

	if !status.Enabled {
		t.Errorf("status.Enabled = false, want true")
	}
	if status.Type != "custom" {
		t.Errorf("status.Type = %q, want custom", status.Type)
	}
	if status.Subject != "custom.clouddeck.io" {
		t.Errorf("status.Subject = %q, want custom.clouddeck.io", status.Subject)
	}

	// Bad keypair rejection
	_, err = mgr.InstallPanelSSL(ctx, PanelSSLInstallRequest{
		Type: "custom",
		Cert: certPEM,
		Key:  "invalid-key",
	})
	if err == nil {
		t.Fatalf("expected error for invalid custom keypair, got nil")
	}
}

func TestInstallPanelSSLLetsEncrypt(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	mgr := NewPanelSSL(cfg)
	ctx := context.Background()

	t.Run("validates domain and email", func(t *testing.T) {
		_, err := mgr.InstallPanelSSL(ctx, PanelSSLInstallRequest{
			Type:   "letsencrypt",
			Domain: "",
			Email:  "test@example.com",
		})
		if err == nil {
			t.Errorf("expected error for empty domain")
		}

		_, err = mgr.InstallPanelSSL(ctx, PanelSSLInstallRequest{
			Type:   "letsencrypt",
			Domain: "panel.example.com",
			Email:  "invalid-email",
		})
		if err == nil {
			t.Errorf("expected error for invalid email")
		}
	})

	t.Run("dry-run succeeds and provisions mock letsencrypt", func(t *testing.T) {
		status, err := mgr.InstallPanelSSL(ctx, PanelSSLInstallRequest{
			Type:   "letsencrypt",
			Domain: "panel.example.com",
			Email:  "admin@example.com",
		})
		if err != nil {
			t.Fatalf("dry-run letsencrypt error = %v", err)
		}
		if !status.Enabled {
			t.Errorf("status.Enabled = false, want true")
		}
		if status.Type != "letsencrypt" {
			t.Errorf("status.Type = %q, want letsencrypt", status.Type)
		}
		if !strings.Contains(status.Issuer, "Let's Encrypt") {
			t.Errorf("status.Issuer = %q, want Let's Encrypt", status.Issuer)
		}
	})
}

func TestDisablePanelSSL(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	mgr := NewPanelSSL(cfg)
	ctx := context.Background()

	// Install self-signed first
	_, err := mgr.InstallPanelSSL(ctx, PanelSSLInstallRequest{
		Type:   "self-signed",
		Domain: "panel.disable.test",
	})
	if err != nil {
		t.Fatalf("InstallPanelSSL error = %v", err)
	}

	// Now disable
	if err := mgr.DisablePanelSSL(ctx); err != nil {
		t.Fatalf("DisablePanelSSL error = %v", err)
	}

	// Verify Nginx config removed
	if fileExists(cfg.PanelNginxConf) {
		t.Errorf("PanelNginxConf still exists after disable")
	}

	// Verify panel.env updated
	envData, err := os.ReadFile(cfg.PanelEnvFile)
	if err != nil {
		t.Fatalf("read panel.env error: %v", err)
	}
	envStr := string(envData)
	if !strings.Contains(envStr, "PORT=2083") {
		t.Errorf("panel.env missing PORT=2083")
	}
	if !strings.Contains(envStr, "HOSTNAME=0.0.0.0") {
		t.Errorf("panel.env missing HOSTNAME=0.0.0.0")
	}
	if !strings.Contains(envStr, "PANEL_COOKIE_SECURE=false") {
		t.Errorf("panel.env missing PANEL_COOKIE_SECURE=false")
	}

	// Verify GetPanelSSLStatus reports disabled
	status, err := mgr.GetPanelSSLStatus()
	if err != nil {
		t.Fatalf("GetPanelSSLStatus error = %v", err)
	}
	if status.Enabled {
		t.Errorf("status.Enabled = true, want false")
	}
	if status.Type != "none" {
		t.Errorf("status.Type = %q, want none", status.Type)
	}
	if status.CookieSecure {
		t.Errorf("status.CookieSecure = true, want false")
	}
}

func TestInstallPanelSSLNginxTestFailure(t *testing.T) {
	cfg := testPanelSSLConfig(t)
	cfg.DryRun = false
	// Point NginxBin to a dummy failing command
	cfg.NginxBin = "false"
	mgr := NewPanelSSL(cfg)

	_, err := mgr.InstallPanelSSL(context.Background(), PanelSSLInstallRequest{
		Type:   "self-signed",
		Domain: "fail.example.com",
	})
	if err == nil {
		t.Fatalf("expected error from failed nginx -t, got nil")
	}

	// Ensure nginx config was removed upon test failure
	if fileExists(cfg.PanelNginxConf) {
		t.Errorf("PanelNginxConf should have been removed after nginx -t failure")
	}
}
