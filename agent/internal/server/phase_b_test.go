package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/appstore"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/fleet"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestPhaseBServer(t *testing.T) (*Server, http.Handler, string) {
	t.Helper()
	dir := t.TempDir()

	st, err := store.Open(filepath.Join(dir, "store.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}

	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		StateDir:      dir,
		NginxSitesDir: filepath.Join(dir, "nginx"),
		Webroot:       filepath.Join(dir, "www"),
		LogDir:        filepath.Join(dir, "logs"),
		DryRun:        true,
		AuthToken:     "phase-b-token",
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	fleetSvc := fleet.New(cfg, auditLog)
	appStoreSvc := appstore.New(cfg, siteSvc, auditLog)

	s := &Server{
		cfg:      cfg,
		sites:    siteSvc,
		fleet:    fleetSvc,
		appstore: appStoreSvc,
		audit:    auditLog,
	}

	mux := http.NewServeMux()

	// Fleet
	mux.HandleFunc("GET /v1/fleet/nodes", s.handleListFleetNodes)
	mux.HandleFunc("GET /api/fleet/nodes", s.handleListFleetNodes)
	mux.HandleFunc("POST /v1/fleet/nodes", s.handleRegisterFleetNode)
	mux.HandleFunc("POST /api/fleet/nodes", s.handleRegisterFleetNode)
	mux.HandleFunc("GET /v1/fleet/nodes/{id}", s.handleGetFleetNode)
	mux.HandleFunc("GET /api/fleet/nodes/{id}", s.handleGetFleetNode)
	mux.HandleFunc("PUT /v1/fleet/nodes/{id}", s.handleUpdateFleetNode)
	mux.HandleFunc("PUT /api/fleet/nodes/{id}", s.handleUpdateFleetNode)
	mux.HandleFunc("DELETE /v1/fleet/nodes/{id}", s.handleDeleteFleetNode)
	mux.HandleFunc("DELETE /api/fleet/nodes/{id}", s.handleDeleteFleetNode)
	mux.HandleFunc("POST /v1/fleet/nodes/{id}/ping", s.handlePingFleetNode)
	mux.HandleFunc("POST /api/fleet/nodes/{id}/ping", s.handlePingFleetNode)
	mux.HandleFunc("GET /v1/fleet/overview", s.handleGetFleetOverview)
	mux.HandleFunc("GET /api/fleet/overview", s.handleGetFleetOverview)

	// App Store
	mux.HandleFunc("GET /v1/appstore/catalog", s.handleGetAppStoreCatalog)
	mux.HandleFunc("GET /api/appstore/catalog", s.handleGetAppStoreCatalog)
	mux.HandleFunc("GET /v1/appstore/installed", s.handleListInstalledApps)
	mux.HandleFunc("GET /api/appstore/installed", s.handleListInstalledApps)
	mux.HandleFunc("POST /v1/appstore/install", s.handleInstallApp)
	mux.HandleFunc("POST /api/appstore/install", s.handleInstallApp)
	mux.HandleFunc("POST /v1/appstore/custom", s.handleInstallCustomApp)
	mux.HandleFunc("POST /api/appstore/custom", s.handleInstallCustomApp)
	mux.HandleFunc("POST /v1/appstore/{id}/action", s.handleAppAction)
	mux.HandleFunc("POST /api/appstore/{id}/action", s.handleAppAction)
	mux.HandleFunc("DELETE /v1/appstore/{id}", s.handleUninstallApp)
	mux.HandleFunc("DELETE /api/appstore/{id}", s.handleUninstallApp)
	mux.HandleFunc("GET /v1/appstore/{id}/logs", s.handleGetAppLogs)
	mux.HandleFunc("GET /api/appstore/{id}/logs", s.handleGetAppLogs)

	return s, s.authenticated(mux), dir
}

func TestPhaseBFleetLifecycle(t *testing.T) {
	_, handler, _ := newTestPhaseBServer(t)

	// 1. List initial nodes: GET /v1/fleet/nodes
	req := httptest.NewRequest(http.MethodGet, "/v1/fleet/nodes", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	var nodesRes struct {
		Nodes []fleet.FleetNode `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &nodesRes); err != nil {
		t.Fatalf("unmarshal nodes: %v", err)
	}
	if len(nodesRes.Nodes) != 1 {
		t.Fatalf("expected 1 primary node, got %d", len(nodesRes.Nodes))
	}

	// 2. Register node: POST /api/fleet/nodes
	regBody := `{"name":"Worker Alpha","host":"10.0.0.12","port":8080,"token":"tok123","tags":["worker","compute"]}`
	regReq := httptest.NewRequest(http.MethodPost, "/api/fleet/nodes", bytes.NewBufferString(regBody))
	regReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	regReq.Header.Set("Content-Type", "application/json")
	regRec := httptest.NewRecorder()
	handler.ServeHTTP(regRec, regReq)

	if regRec.Code != http.StatusOK {
		t.Fatalf("register failed: %d: %s", regRec.Code, regRec.Body.String())
	}
	var createdNode fleet.FleetNode
	if err := json.Unmarshal(regRec.Body.Bytes(), &createdNode); err != nil {
		t.Fatalf("unmarshal registered node: %v", err)
	}
	if createdNode.Name != "Worker Alpha" {
		t.Fatalf("expected Worker Alpha, got %s", createdNode.Name)
	}

	// 3. Ping node: POST /v1/fleet/nodes/{id}/ping
	pingReq := httptest.NewRequest(http.MethodPost, "/v1/fleet/nodes/"+createdNode.ID+"/ping", nil)
	pingReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	pingRec := httptest.NewRecorder()
	handler.ServeHTTP(pingRec, pingReq)

	if pingRec.Code != http.StatusOK {
		t.Fatalf("ping failed: %d: %s", pingRec.Code, pingRec.Body.String())
	}

	// 4. Fleet overview: GET /api/fleet/overview
	overReq := httptest.NewRequest(http.MethodGet, "/api/fleet/overview", nil)
	overReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	overRec := httptest.NewRecorder()
	handler.ServeHTTP(overRec, overReq)

	if overRec.Code != http.StatusOK {
		t.Fatalf("overview failed: %d: %s", overRec.Code, overRec.Body.String())
	}
	var overview fleet.FleetOverview
	if err := json.Unmarshal(overRec.Body.Bytes(), &overview); err != nil {
		t.Fatalf("unmarshal overview: %v", err)
	}
	if overview.TotalNodes != 2 {
		t.Fatalf("expected 2 total nodes in overview, got %d", overview.TotalNodes)
	}

	// 5. Delete worker: DELETE /v1/fleet/nodes/{id}
	delReq := httptest.NewRequest(http.MethodDelete, "/v1/fleet/nodes/"+createdNode.ID, nil)
	delReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	delRec := httptest.NewRecorder()
	handler.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusOK {
		t.Fatalf("delete failed: %d: %s", delRec.Code, delRec.Body.String())
	}
}

func TestPhaseBAppStoreLifecycle(t *testing.T) {
	_, handler, _ := newTestPhaseBServer(t)

	// 1. Get Catalog: GET /v1/appstore/catalog
	catReq := httptest.NewRequest(http.MethodGet, "/v1/appstore/catalog", nil)
	catReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	catRec := httptest.NewRecorder()
	handler.ServeHTTP(catRec, catReq)

	if catRec.Code != http.StatusOK {
		t.Fatalf("catalog failed: %d: %s", catRec.Code, catRec.Body.String())
	}
	var catRes struct {
		Catalog []appstore.AppTemplate `json:"catalog"`
	}
	if err := json.Unmarshal(catRec.Body.Bytes(), &catRes); err != nil {
		t.Fatalf("unmarshal catalog: %v", err)
	}
	if len(catRes.Catalog) < 6 {
		t.Fatalf("expected >=6 catalog items, got %d", len(catRes.Catalog))
	}

	// 2. Install App: POST /api/appstore/install
	installBody := `{"templateId":"plausible","domain":"stats.mycorp.org","port":8000,"envVars":{"BASE_URL":"http://stats.mycorp.org"}}`
	instReq := httptest.NewRequest(http.MethodPost, "/api/appstore/install", bytes.NewBufferString(installBody))
	instReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	instReq.Header.Set("Content-Type", "application/json")
	instRec := httptest.NewRecorder()
	handler.ServeHTTP(instRec, instReq)

	if instRec.Code != http.StatusOK {
		t.Fatalf("install failed: %d: %s", instRec.Code, instRec.Body.String())
	}
	var installed appstore.InstalledApp
	if err := json.Unmarshal(instRec.Body.Bytes(), &installed); err != nil {
		t.Fatalf("unmarshal installed: %v", err)
	}
	if installed.TemplateID != "plausible" || installed.Status != "running" {
		t.Fatalf("unexpected installed app: %+v", installed)
	}

	// 3. List installed: GET /v1/appstore/installed
	listReq := httptest.NewRequest(http.MethodGet, "/v1/appstore/installed", nil)
	listReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("list installed failed: %d: %s", listRec.Code, listRec.Body.String())
	}

	// 4. App Action: POST /api/appstore/{id}/action (restart)
	actBody := `{"action":"restart"}`
	actReq := httptest.NewRequest(http.MethodPost, "/api/appstore/"+installed.ID+"/action", bytes.NewBufferString(actBody))
	actReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	actReq.Header.Set("Content-Type", "application/json")
	actRec := httptest.NewRecorder()
	handler.ServeHTTP(actRec, actReq)

	if actRec.Code != http.StatusOK {
		t.Fatalf("action failed: %d: %s", actRec.Code, actRec.Body.String())
	}

	// 5. Get Logs: GET /v1/appstore/{id}/logs
	logsReq := httptest.NewRequest(http.MethodGet, "/v1/appstore/"+installed.ID+"/logs?tail=50", nil)
	logsReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	logsRec := httptest.NewRecorder()
	handler.ServeHTTP(logsRec, logsReq)

	if logsRec.Code != http.StatusOK {
		t.Fatalf("logs failed: %d: %s", logsRec.Code, logsRec.Body.String())
	}

	// 6. Uninstall: DELETE /api/appstore/{id}
	delReq := httptest.NewRequest(http.MethodDelete, "/api/appstore/"+installed.ID, nil)
	delReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	delRec := httptest.NewRecorder()
	handler.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusOK {
		t.Fatalf("uninstall failed: %d: %s", delRec.Code, delRec.Body.String())
	}

	// 7. Install Custom App: POST /v1/appstore/custom
	customBody := `{"name":"custom-app","domain":"custom.test","composeYaml":"version: '3.8'\nservices:\n  app:\n    image: redis:alpine\n    ports:\n      - \"6380:6379\""}`
	customReq := httptest.NewRequest(http.MethodPost, "/v1/appstore/custom", bytes.NewBufferString(customBody))
	customReq.Header.Set("X-CloudDeck-Agent-Token", "phase-b-token")
	customReq.Header.Set("Content-Type", "application/json")
	customRec := httptest.NewRecorder()
	handler.ServeHTTP(customRec, customReq)

	if customRec.Code != http.StatusOK {
		t.Fatalf("install custom failed: %d: %s", customRec.Code, customRec.Body.String())
	}
	var customInstalled appstore.InstalledApp
	if err := json.Unmarshal(customRec.Body.Bytes(), &customInstalled); err != nil {
		t.Fatalf("unmarshal custom installed: %v", err)
	}
	if customInstalled.Name != "custom-app" || customInstalled.Port != 6380 {
		t.Fatalf("unexpected custom installed app: %+v", customInstalled)
	}
}
