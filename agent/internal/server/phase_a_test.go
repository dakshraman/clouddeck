package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"clouddeck/agent/internal/analytics"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/git"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/ssl"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
	"clouddeck/agent/internal/wordpress"
)

func newTestPhaseAServer(t *testing.T) (*Server, http.Handler, *store.Store, string) {
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
		AuthToken:     "phase-a-token",
	}
	_ = os.MkdirAll(cfg.LogDir, 0o755)

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	sslIssuer := ssl.New(st, siteSvc, eng, auditLog, cfg)
	gitSvc := git.New(st, cfg, auditLog)
	analyticsSvc := analytics.New(cfg, st)
	wpSvc := wordpress.New(cfg, siteSvc, nil, auditLog, eng)

	s := &Server{
		cfg:       cfg,
		sites:     siteSvc,
		ssl:       sslIssuer,
		git:       gitSvc,
		analytics: analyticsSvc,
		wordpress: wpSvc,
		audit:     auditLog,
	}

	mux := http.NewServeMux()

	// Git releases and rollback
	mux.HandleFunc("GET /v1/sites/{domain}/git/releases", s.handleGetSiteGitReleases)
	mux.HandleFunc("GET /api/sites/{domain}/git/releases", s.handleGetSiteGitReleases)
	mux.HandleFunc("POST /v1/sites/{domain}/git/rollback", s.handleRollbackSiteGit)
	mux.HandleFunc("POST /api/sites/{domain}/git/rollback", s.handleRollbackSiteGit)

	// Visitor & traffic analytics
	mux.HandleFunc("GET /v1/sites/{domain}/analytics", s.handleGetSiteAnalytics)
	mux.HandleFunc("GET /api/sites/{domain}/analytics", s.handleGetSiteAnalytics)
	mux.HandleFunc("GET /v1/system/analytics", s.handleGetSystemAnalytics)
	mux.HandleFunc("GET /api/system/analytics", s.handleGetSystemAnalytics)

	// Wildcard SSL & DNS providers
	mux.HandleFunc("GET /v1/ssl/providers", s.handleListSSLProviders)
	mux.HandleFunc("GET /api/ssl/providers", s.handleListSSLProviders)
	mux.HandleFunc("POST /v1/sites/{domain}/ssl/wildcard", s.handleIssueWildcardSSL)
	mux.HandleFunc("POST /api/sites/{domain}/ssl/wildcard", s.handleIssueWildcardSSL)

	// WordPress staging push
	mux.HandleFunc("POST /v1/sites/{domain}/wordpress/push-staging", s.handlePushStagingWordPress)
	mux.HandleFunc("POST /api/sites/{domain}/wordpress/push-staging", s.handlePushStagingWordPress)

	return s, s.authenticated(mux), st, dir
}

func TestPhaseAGitReleasesAndRollback(t *testing.T) {
	s, handler, st, dir := newTestPhaseAServer(t)
	domain := "gitapp.test"
	siteRoot := filepath.Join(dir, "www", domain)
	_ = os.MkdirAll(siteRoot, 0o755)

	_ = st.CreateSite(store.Site{Domain: domain, Root: siteRoot, PHPVersion: "8.2", Status: store.SiteActive})

	// 1. Initial list of releases
	req := httptest.NewRequest(http.MethodGet, "/v1/sites/"+domain+"/git/releases", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	var res struct {
		Releases []git.Release `json:"releases"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal releases: %v", err)
	}
	if len(res.Releases) == 0 {
		t.Fatalf("expected at least 1 baseline release")
	}

	// 2. Add two atomic releases directly to verify rollback
	rel1Dir := filepath.Join(siteRoot, "releases", "rel1")
	rel2Dir := filepath.Join(siteRoot, "releases", "rel2")
	_ = os.MkdirAll(rel1Dir, 0o755)
	_ = os.MkdirAll(rel2Dir, 0o755)

	_ = s.git.RecordAtomicRelease(siteRoot, git.Release{
		ID:         "rel1",
		CommitHash: "commit1",
		CommitMsg:  "v1.0.0",
		Branch:     "main",
		Path:       rel1Dir,
		Active:     true,
		DeployedAt: time.Now().Add(-1 * time.Hour),
	})
	_ = s.git.RecordAtomicRelease(siteRoot, git.Release{
		ID:         "rel2",
		CommitHash: "commit2",
		CommitMsg:  "v1.1.0",
		Branch:     "main",
		Path:       rel2Dir,
		Active:     true,
		DeployedAt: time.Now(),
	})

	// 3. Rollback via /api/sites/{domain}/git/rollback
	rollbackReq := httptest.NewRequest(http.MethodPost, "/api/sites/"+domain+"/git/rollback", bytes.NewBufferString(`{"releaseId":"rel1"}`))
	rollbackReq.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	rollbackReq.Header.Set("Content-Type", "application/json")
	rollbackRec := httptest.NewRecorder()
	handler.ServeHTTP(rollbackRec, rollbackReq)

	if rollbackRec.Code != http.StatusOK {
		t.Fatalf("rollback failed: %d: %s", rollbackRec.Code, rollbackRec.Body.String())
	}
	var rolled git.Release
	_ = json.Unmarshal(rollbackRec.Body.Bytes(), &rolled)
	if rolled.ID != "rel1" || !rolled.Active {
		t.Fatalf("expected rolled release to be rel1 and active, got %+v", rolled)
	}
}

func TestPhaseAAnalytics(t *testing.T) {
	_, handler, st, dir := newTestPhaseAServer(t)
	domain := "analytics.test"
	siteRoot := filepath.Join(dir, "www", domain)
	_ = os.MkdirAll(siteRoot, 0o755)
	_ = st.CreateSite(store.Site{Domain: domain, Root: siteRoot, PHPVersion: "8.2", Status: store.SiteActive})

	// Write simulated Nginx log
	nowStr := time.Now().UTC().Format("02/Jan/2006:15:04:05 -0700")
	logContent := fmt.Sprintf(`203.0.113.195 - - [%s] "GET /api/v1/products HTTP/1.1" 200 4096 "https://google.com" "Mozilla/5.0"
66.249.66.1 - - [%s] "GET /robots.txt HTTP/1.1" 200 128 "-" "Googlebot/2.1"
198.51.100.4 - - [%s] "GET /login HTTP/1.1" 401 256 "-" "Mozilla/5.0"
`, nowStr, nowStr, nowStr)

	logFile := filepath.Join(dir, "logs", domain+".access.log")
	_ = os.WriteFile(logFile, []byte(logContent), 0o644)

	// Test GET /v1/sites/{domain}/analytics
	req := httptest.NewRequest(http.MethodGet, "/v1/sites/"+domain+"/analytics?timeframe=24h", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	var siteStats analytics.SiteAnalytics
	if err := json.Unmarshal(rec.Body.Bytes(), &siteStats); err != nil {
		t.Fatalf("unmarshal site stats: %v", err)
	}
	if siteStats.TotalRequests != 3 {
		t.Errorf("expected 3 requests, got %d", siteStats.TotalRequests)
	}
	if siteStats.BotMetrics.BotRequests != 1 {
		t.Errorf("expected 1 bot request, got %d", siteStats.BotMetrics.BotRequests)
	}

	// Test GET /api/system/analytics
	sysReq := httptest.NewRequest(http.MethodGet, "/api/system/analytics?timeframe=24h", nil)
	sysReq.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	sysRec := httptest.NewRecorder()
	handler.ServeHTTP(sysRec, sysReq)

	if sysRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", sysRec.Code, sysRec.Body.String())
	}
	var sysStats analytics.SystemAnalytics
	if err := json.Unmarshal(sysRec.Body.Bytes(), &sysStats); err != nil {
		t.Fatalf("unmarshal system stats: %v", err)
	}
	if sysStats.TotalRequests != 3 {
		t.Errorf("expected 3 system requests, got %d", sysStats.TotalRequests)
	}
	if sysStats.TotalSites != 1 {
		t.Errorf("expected 1 site in system stats, got %d", sysStats.TotalSites)
	}
}

func TestPhaseAWildcardSSL(t *testing.T) {
	_, handler, st, dir := newTestPhaseAServer(t)
	domain := "wildcard.test"
	siteRoot := filepath.Join(dir, "www", domain)
	_ = os.MkdirAll(siteRoot, 0o755)
	_ = st.CreateSite(store.Site{Domain: domain, Root: siteRoot, PHPVersion: "8.2", Status: store.SiteActive})

	// 1. List DNS Providers: GET /v1/ssl/providers
	provReq := httptest.NewRequest(http.MethodGet, "/v1/ssl/providers", nil)
	provReq.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	provRec := httptest.NewRecorder()
	handler.ServeHTTP(provRec, provReq)

	if provRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", provRec.Code, provRec.Body.String())
	}

	// 2. Request Wildcard Cert: POST /api/sites/{domain}/ssl/wildcard
	body := `{"email":"admin@wildcard.test","provider":"cloudflare","credentials":{"api_token":"cf_secret_token"}}`
	issueReq := httptest.NewRequest(http.MethodPost, "/api/sites/"+domain+"/ssl/wildcard", bytes.NewBufferString(body))
	issueReq.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	issueReq.Header.Set("Content-Type", "application/json")
	issueRec := httptest.NewRecorder()
	handler.ServeHTTP(issueRec, issueReq)

	if issueRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", issueRec.Code, issueRec.Body.String())
	}

	var res ssl.WildcardResult
	if err := json.Unmarshal(issueRec.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal wildcard res: %v", err)
	}
	if !res.Success || res.Wildcard != "*.wildcard.test" {
		t.Fatalf("unexpected wildcard result: %+v", res)
	}
}

func TestPhaseAWordPressPushStaging(t *testing.T) {
	_, handler, st, dir := newTestPhaseAServer(t)
	prodDomain := "prodpress.test"
	stagingDomain := "staging." + prodDomain

	prodRoot := filepath.Join(dir, "www", prodDomain)
	stagingRoot := filepath.Join(dir, "www", stagingDomain)
	_ = os.MkdirAll(prodRoot, 0o755)
	_ = os.MkdirAll(stagingRoot, 0o755)

	_ = st.CreateSite(store.Site{Domain: prodDomain, Root: prodRoot, PHPVersion: "8.2", Status: store.SiteActive})
	_ = st.CreateSite(store.Site{Domain: stagingDomain, Root: stagingRoot, PHPVersion: "8.2", Status: store.SiteActive})

	// Setup dummy wp-config.php on both
	prodWpConfig := `<?php
define('DB_NAME', 'prod_db');
define('DB_USER', 'prod_user');
define('DB_PASSWORD', 'prod_pass');
define('DB_HOST', 'localhost');
`
	stagingWpConfig := `<?php
define('DB_NAME', 'staging_db');
define('DB_USER', 'staging_user');
define('DB_PASSWORD', 'staging_pass');
define('DB_HOST', 'localhost');
define('WP_HOME', 'http://staging.prodpress.test');
`
	_ = os.WriteFile(filepath.Join(prodRoot, "wp-config.php"), []byte(prodWpConfig), 0o644)
	_ = os.WriteFile(filepath.Join(stagingRoot, "wp-config.php"), []byte(stagingWpConfig), 0o644)

	// Add a staging-only file
	_ = os.WriteFile(filepath.Join(stagingRoot, "staging-feature.php"), []byte("<?php echo 'from staging';"), 0o644)

	// Call POST /v1/sites/{domain}/wordpress/push-staging
	req := httptest.NewRequest(http.MethodPost, "/v1/sites/"+prodDomain+"/wordpress/push-staging", nil)
	req.Header.Set("X-CloudDeck-Agent-Token", "phase-a-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}

	var res wordpress.WPPushResult
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal push res: %v", err)
	}
	if !res.Success {
		t.Fatalf("expected push success: %+v", res)
	}
	if _, err := os.Stat(res.SafetyBackup); err != nil {
		t.Fatalf("safety backup missing: %v", err)
	}

	// Staging file should now exist in prod
	if _, err := os.Stat(filepath.Join(prodRoot, "staging-feature.php")); err != nil {
		t.Fatalf("expected staging file in prod root: %v", err)
	}
}
