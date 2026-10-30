package server

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/ssl"
)

func newTestPanelSSLServer(t *testing.T) (*Server, http.Handler, config.Config) {
	t.Helper()
	dir := t.TempDir()
	cfg := config.Config{
		PanelEnvFile:      filepath.Join(dir, "panel.env"),
		PanelSSLDir:       filepath.Join(dir, "ssl"),
		PanelNginxConf:    filepath.Join(dir, "nginx", "clouddeck-panel.conf"),
		PanelPort:         2083,
		PanelInternalPort: 2082,
		DryRun:            true,
	}

	panelSSL := ssl.NewPanelSSL(cfg)
	s := &Server{
		cfg:      cfg,
		panelSSL: panelSSL,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/panel/ssl", s.handleGetPanelSSL)
	mux.HandleFunc("POST /v1/panel/ssl", s.handleInstallPanelSSL)
	mux.HandleFunc("DELETE /v1/panel/ssl", s.handleDisablePanelSSL)

	return s, mux, cfg
}

func generateServerTestKeyPair(t *testing.T, domain string) (certPEM, keyPEM string) {
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

func TestServerGetPanelSSLInitial(t *testing.T) {
	_, mux, _ := newTestPanelSSLServer(t)

	req := httptest.NewRequest(http.MethodGet, "/v1/panel/ssl", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var status ssl.PanelSSLStatus
	if err := json.NewDecoder(rec.Body).Decode(&status); err != nil {
		t.Fatalf("decode response: %v", err)
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

func TestServerInstallPanelSSLSelfSigned(t *testing.T) {
	_, mux, _ := newTestPanelSSLServer(t)

	body, _ := json.Marshal(ssl.PanelSSLInstallRequest{
		Type:   "self-signed",
		Domain: "panel.test.local",
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var status ssl.PanelSSLStatus
	if err := json.NewDecoder(rec.Body).Decode(&status); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !status.Enabled {
		t.Errorf("status.Enabled = false, want true")
	}
	if status.Type != "self-signed" {
		t.Errorf("status.Type = %q, want self-signed", status.Type)
	}
	if status.Domain != "panel.test.local" {
		t.Errorf("status.Domain = %q, want panel.test.local", status.Domain)
	}
	if !status.CookieSecure {
		t.Errorf("status.CookieSecure = false, want true")
	}
	if status.Port != 2083 {
		t.Errorf("status.Port = %d, want 2083", status.Port)
	}

	// GET /v1/panel/ssl should reflect the installed SSL
	getReq := httptest.NewRequest(http.MethodGet, "/v1/panel/ssl", nil)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", getRec.Code, http.StatusOK)
	}
	var getStatus ssl.PanelSSLStatus
	_ = json.NewDecoder(getRec.Body).Decode(&getStatus)
	if !getStatus.Enabled || getStatus.Type != "self-signed" {
		t.Errorf("unexpected GET status: %+v", getStatus)
	}
}

func TestServerInstallPanelSSLCustom(t *testing.T) {
	_, mux, _ := newTestPanelSSLServer(t)

	certPEM, keyPEM := generateServerTestKeyPair(t, "custom.clouddeck.test")
	body, _ := json.Marshal(ssl.PanelSSLInstallRequest{
		Type:   "custom",
		Domain: "custom.clouddeck.test",
		Cert:   certPEM,
		Key:    keyPEM,
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var status ssl.PanelSSLStatus
	if err := json.NewDecoder(rec.Body).Decode(&status); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !status.Enabled {
		t.Errorf("status.Enabled = false, want true")
	}
	if status.Type != "custom" {
		t.Errorf("status.Type = %q, want custom", status.Type)
	}
	if status.Subject != "custom.clouddeck.test" {
		t.Errorf("status.Subject = %q, want custom.clouddeck.test", status.Subject)
	}
}

func TestServerInstallPanelSSLInvalid(t *testing.T) {
	_, mux, _ := newTestPanelSSLServer(t)

	t.Run("invalid json body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader([]byte("{invalid-json")))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("unsupported ssl type", func(t *testing.T) {
		body, _ := json.Marshal(ssl.PanelSSLInstallRequest{Type: "unknown-type"})
		req := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})

	t.Run("invalid custom keypair", func(t *testing.T) {
		body, _ := json.Marshal(ssl.PanelSSLInstallRequest{
			Type: "custom",
			Cert: "not-a-cert",
			Key:  "not-a-key",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})
}

func TestServerDisablePanelSSL(t *testing.T) {
	_, mux, _ := newTestPanelSSLServer(t)

	// Install self-signed first
	installBody, _ := json.Marshal(ssl.PanelSSLInstallRequest{
		Type:   "self-signed",
		Domain: "panel.test.local",
	})
	installReq := httptest.NewRequest(http.MethodPost, "/v1/panel/ssl", bytes.NewReader(installBody))
	installRec := httptest.NewRecorder()
	mux.ServeHTTP(installRec, installReq)
	if installRec.Code != http.StatusOK {
		t.Fatalf("install status = %d, want 200", installRec.Code)
	}

	// Send DELETE /v1/panel/ssl
	deleteReq := httptest.NewRequest(http.MethodDelete, "/v1/panel/ssl", nil)
	deleteRec := httptest.NewRecorder()
	mux.ServeHTTP(deleteRec, deleteReq)

	if deleteRec.Code != http.StatusOK {
		t.Fatalf("delete status = %d, want 200: %s", deleteRec.Code, deleteRec.Body.String())
	}

	var status ssl.PanelSSLStatus
	if err := json.NewDecoder(deleteRec.Body).Decode(&status); err != nil {
		t.Fatalf("decode delete response: %v", err)
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

	// Verify subsequent GET
	getReq := httptest.NewRequest(http.MethodGet, "/v1/panel/ssl", nil)
	getRec := httptest.NewRecorder()
	mux.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("get status = %d, want 200", getRec.Code)
	}
	var getStatus ssl.PanelSSLStatus
	_ = json.NewDecoder(getRec.Body).Decode(&getStatus)
	if getStatus.Enabled {
		t.Errorf("getStatus.Enabled = true, want false")
	}
	if getStatus.Type != "none" {
		t.Errorf("getStatus.Type = %q, want none", getStatus.Type)
	}
}
