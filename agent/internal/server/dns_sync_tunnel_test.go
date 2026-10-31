package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/dns"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/tunnel"
)

func TestServerDNSNameservers(t *testing.T) {
	auditDir := t.TempDir()
	auditLog, err := audit.Open(auditDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		Nameserver1: "ns1.oldhost.com",
		Nameserver2: "ns2.oldhost.com",
		ServerIP:    "192.0.2.10",
		DryRun:      true,
	}
	dnsMgr := dns.New(cfg, auditLog)
	s := &Server{
		cfg: cfg,
		dns: dnsMgr,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/dns/nameservers", s.handleGetDNSNameservers)
	mux.HandleFunc("PUT /v1/dns/nameservers", s.handleSetDNSNameservers)

	// GET initial
	req := httptest.NewRequest(http.MethodGet, "/v1/dns/nameservers", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/dns/nameservers code = %d, want 200", rec.Code)
	}
	var info dns.NameserversInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &info); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}
	if info.Nameserver1 != "ns1.oldhost.com" || info.Nameserver2 != "ns2.oldhost.com" || info.ServerIP != "192.0.2.10" {
		t.Fatalf("unexpected info: %+v", info)
	}

	// PUT update
	updateBody := `{"nameserver1":"ns1.newhost.com","nameserver2":"ns2.newhost.com"}`
	req = httptest.NewRequest(http.MethodPut, "/v1/dns/nameservers", bytes.NewBufferString(updateBody))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("PUT /v1/dns/nameservers code = %d, want 200", rec.Code)
	}
	var updated dns.NameserversInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}
	if updated.Nameserver1 != "ns1.newhost.com" || updated.Nameserver2 != "ns2.newhost.com" || updated.ServerIP != "192.0.2.10" {
		t.Fatalf("unexpected updated info: %+v", updated)
	}

	// GET again to verify persistence
	req = httptest.NewRequest(http.MethodGet, "/v1/dns/nameservers", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/dns/nameservers after PUT code = %d", rec.Code)
	}
	var infoAfter dns.NameserversInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &infoAfter); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}
	if infoAfter.Nameserver1 != "ns1.newhost.com" || infoAfter.Nameserver2 != "ns2.newhost.com" {
		t.Fatalf("unexpected infoAfter: %+v", infoAfter)
	}
}

func TestServerTunnelEndpoints(t *testing.T) {
	cfg := config.Config{
		DryRun: true,
	}
	tunnelSvc := tunnel.New(cfg)
	s := &Server{
		cfg:    cfg,
		tunnel: tunnelSvc,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/sites/{domain}/tunnel", s.handleGetTunnel)
	mux.HandleFunc("POST /v1/sites/{domain}/tunnel", s.handleStartTunnel)
	mux.HandleFunc("DELETE /v1/sites/{domain}/tunnel", s.handleStopTunnel)
	mux.HandleFunc("GET /v1/tunnels", s.handleListTunnels)

	// GET initially when inactive
	req := httptest.NewRequest(http.MethodGet, "/v1/sites/example.com/tunnel", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/sites/example.com/tunnel code = %d, want 200", rec.Code)
	}
	var inactiveResp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &inactiveResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if inactiveResp["status"] != "inactive" {
		t.Fatalf("status = %v, want inactive", inactiveResp["status"])
	}

	// GET /v1/tunnels list
	req = httptest.NewRequest(http.MethodGet, "/v1/tunnels", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /v1/tunnels code = %d, want 200", rec.Code)
	}
	var listResp map[string][]map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(listResp["tunnels"]) != 0 {
		t.Fatalf("expected 0 tunnels, got %d", len(listResp["tunnels"]))
	}

	// POST start tunnel
	req = httptest.NewRequest(http.MethodPost, "/v1/sites/example.com/tunnel", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST /v1/sites/example.com/tunnel code = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var startedTunnel map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &startedTunnel); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if startedTunnel["domain"] != "example.com" || startedTunnel["status"] != "running" {
		t.Fatalf("unexpected started tunnel: %+v", startedTunnel)
	}

	// GET running tunnel
	req = httptest.NewRequest(http.MethodGet, "/v1/sites/example.com/tunnel", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET running tunnel code = %d", rec.Code)
	}
	var runningTunnel map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &runningTunnel); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if runningTunnel["domain"] != "example.com" || runningTunnel["status"] != "running" {
		t.Fatalf("running tunnel = %+v", runningTunnel)
	}

	// GET /v1/tunnels list with 1 tunnel
	req = httptest.NewRequest(http.MethodGet, "/v1/tunnels", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var listResp2 map[string][]map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &listResp2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(listResp2["tunnels"]) != 1 {
		t.Fatalf("expected 1 tunnel, got %d", len(listResp2["tunnels"]))
	}

	// DELETE stop tunnel
	req = httptest.NewRequest(http.MethodDelete, "/v1/sites/example.com/tunnel", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("DELETE tunnel code = %d", rec.Code)
	}

	// Verify tunnel inactive again
	req = httptest.NewRequest(http.MethodGet, "/v1/sites/example.com/tunnel", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var inactiveResp2 map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &inactiveResp2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if inactiveResp2["status"] != "inactive" {
		t.Fatalf("expected inactive, got %+v", inactiveResp2)
	}
}

func TestServerDNSMailSync(t *testing.T) {
	tempDir := t.TempDir()
	auditLog, err := audit.Open(tempDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	// Write fake pdnsutil script that handles list-all-zones, create-zone, add-record, list-zone
	fakeScript := filepath.Join(tempDir, "fake-pdnsutil")
	markerFile := filepath.Join(tempDir, "zone_created")
	scriptContent := fmt.Sprintf(`#!/bin/sh
cmd="$1"
case "$cmd" in
  create-zone)
    touch '%s'
    exit 0
    ;;
  list-all-zones)
    if [ -f '%s' ]; then
      echo "example.com"
    fi
    exit 0
    ;;
  add-record)
    exit 0
    ;;
  list-zone)
    echo "example.com 3600 IN NS ns1.example.com"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`, markerFile, markerFile)
	if err := os.WriteFile(fakeScript, []byte(scriptContent), 0755); err != nil {
		t.Fatalf("write fake pdnsutil: %v", err)
	}

	mailRoot := filepath.Join(tempDir, "mail")
	cfg := config.Config{
		StateDir:         tempDir,
		PdnsUtilBin:      fakeScript,
		MailRoot:         mailRoot,
		MailDomainsFile:  filepath.Join(mailRoot, "domains"),
		MailUsersFile:    filepath.Join(mailRoot, "users"),
		MailAliasesFile:  filepath.Join(mailRoot, "aliases"),
		MailAutoreplyDir: filepath.Join(mailRoot, "autoreply"),
		MailDkimDir:      filepath.Join(mailRoot, "dkim"),
		MailVhostsDir:    filepath.Join(mailRoot, "vhosts"),
		MailHostname:     "mail.example.com",
		DryRun:           false,
	}

	dnsMgr := dns.New(cfg, auditLog)
	mailSvc := mail.New(cfg, auditLog, dnsMgr)

	s := &Server{
		cfg:  cfg,
		dns:  dnsMgr,
		mail: mailSvc,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/sites/{domain}/dns-mail-sync", s.handleDNSMailSync)

	req := httptest.NewRequest(http.MethodPost, "/v1/sites/example.com/dns-mail-sync", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("POST /v1/sites/example.com/dns-mail-sync code = %d, body: %s", rec.Code, rec.Body.String())
	}

	var syncResp struct {
		DNSZoneCreated    bool         `json:"dnsZoneCreated"`
		MailDomainCreated bool         `json:"mailDomainCreated"`
		DKIMApplied       bool         `json:"dkimApplied"`
		Records           []dns.Record `json:"records"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &syncResp); err != nil {
		t.Fatalf("unmarshal sync response: %v", err)
	}

	if !syncResp.DNSZoneCreated {
		t.Error("expected dnsZoneCreated = true")
	}
	if !syncResp.MailDomainCreated {
		t.Error("expected mailDomainCreated = true")
	}
	if !syncResp.DKIMApplied {
		t.Error("expected dkimApplied = true")
	}
	if len(syncResp.Records) == 0 {
		t.Error("expected non-empty records")
	}

	// Running sync a second time: zone & mail domain already exist
	// Update fake pdnsutil to list the zone as existing
	scriptContent2 := `#!/bin/sh
cmd="$1"
case "$cmd" in
  list-all-zones)
    echo "example.com"
    exit 0
    ;;
  create-zone)
    exit 0
    ;;
  add-record)
    exit 0
    ;;
  list-zone)
    echo "example.com 3600 IN NS ns1.example.com"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`
	_ = os.WriteFile(fakeScript, []byte(scriptContent2), 0755)

	rec2 := httptest.NewRecorder()
	mux.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusOK {
		t.Fatalf("second sync code = %d", rec2.Code)
	}
	var syncResp2 struct {
		DNSZoneCreated    bool `json:"dnsZoneCreated"`
		MailDomainCreated bool `json:"mailDomainCreated"`
		DKIMApplied       bool `json:"dkimApplied"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &syncResp2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if syncResp2.DNSZoneCreated {
		t.Errorf("second sync expected dnsZoneCreated=false, got %v", syncResp2.DNSZoneCreated)
	}
	if syncResp2.MailDomainCreated {
		t.Errorf("second sync expected mailDomainCreated=false, got %v", syncResp2.MailDomainCreated)
	}
	if !syncResp2.DKIMApplied {
		t.Errorf("second sync expected dkimApplied=true, got %v", syncResp2.DKIMApplied)
	}
}
