package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/alerts"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/caching"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/doctor"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func newTestWave1Server(t *testing.T) (*Server, http.Handler, string) {
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
		AuthToken:     "test-token",
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	cachingSvc := caching.New(cfg, auditLog)
	alertsSvc := alerts.New(cfg, auditLog)
	doctorSvc := doctor.New(cfg, auditLog)

	siteRoot := filepath.Join(dir, "www", "wave1.test")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("mkdir site root: %v", err)
	}

	if err := st.CreateSite(store.Site{
		Domain:     "wave1.test",
		Root:       siteRoot,
		PHPVersion: "8.3",
		Status:     store.SiteActive,
		CreatedAt:  store.Now(),
		UpdatedAt:  store.Now(),
	}); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}

	s := &Server{
		cfg:     cfg,
		sites:   siteSvc,
		caching: cachingSvc,
		alerts:  alertsSvc,
		doctor:  doctorSvc,
		audit:   auditLog,
	}

	mux := http.NewServeMux()
	// Caching
	mux.HandleFunc("GET /v1/caching/status", s.handleCachingStatus)
	mux.HandleFunc("GET /api/caching/status", s.handleCachingStatus)
	mux.HandleFunc("POST /v1/caching/redis/toggle", s.handleRedisToggle)
	mux.HandleFunc("POST /api/caching/redis/toggle", s.handleRedisToggle)
	mux.HandleFunc("POST /v1/caching/redis/flush", s.handleRedisFlush)
	mux.HandleFunc("POST /api/caching/redis/flush", s.handleRedisFlush)

	// Alerts
	mux.HandleFunc("GET /v1/alerts/config", s.handleGetAlertsConfig)
	mux.HandleFunc("GET /api/alerts/config", s.handleGetAlertsConfig)
	mux.HandleFunc("PUT /v1/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("PUT /api/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /v1/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /api/alerts/config", s.handleUpdateAlertsConfig)
	mux.HandleFunc("POST /v1/alerts/test", s.handleTestAlerts)
	mux.HandleFunc("POST /api/alerts/test", s.handleTestAlerts)

	// Site FastCGI Cache
	mux.HandleFunc("GET /v1/sites/{domain}/cache", s.handleGetSiteCache)
	mux.HandleFunc("GET /api/sites/{domain}/cache", s.handleGetSiteCache)
	mux.HandleFunc("PUT /v1/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("PUT /api/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /v1/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /api/sites/{domain}/cache", s.handleSetSiteCache)
	mux.HandleFunc("POST /v1/sites/{domain}/cache/purge", s.handlePurgeSiteCache)
	mux.HandleFunc("POST /api/sites/{domain}/cache/purge", s.handlePurgeSiteCache)

	// Doctor Log Investigation
	mux.HandleFunc("POST /v1/sites/{domain}/doctor/investigate-logs", s.handleInvestigateSiteLogs)
	mux.HandleFunc("POST /api/sites/{domain}/doctor/investigate-logs", s.handleInvestigateSiteLogs)

	return s, s.authenticated(mux), dir
}

func TestWave1CachingEndpoints(t *testing.T) {
	_, handler, _ := newTestWave1Server(t)

	// 1. GET /v1/caching/status
	t.Run("GetCachingStatus", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/caching/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var st caching.Status
		if err := json.Unmarshal(rec.Body.Bytes(), &st); err != nil {
			t.Fatalf("unmarshal status: %v", err)
		}
	})

	// 2. GET /api/caching/status alias
	t.Run("GetCachingStatusAPI", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/caching/status", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// 3. POST /v1/caching/redis/toggle
	t.Run("ToggleRedis", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"action": "restart"})
		req := httptest.NewRequest(http.MethodPost, "/v1/caching/redis/toggle", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if res["action"] != "restart" || res["success"] != true {
			t.Fatalf("unexpected toggle response: %v", res)
		}
	})

	// 4. POST /v1/caching/redis/toggle invalid action
	t.Run("ToggleRedisInvalidAction", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"action": "destroy"})
		req := httptest.NewRequest(http.MethodPost, "/v1/caching/redis/toggle", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code == http.StatusOK {
			t.Fatalf("expected failure for invalid action, got 200")
		}
	})

	// 5. POST /v1/caching/redis/flush
	t.Run("FlushRedis", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/caching/redis/flush", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal response: %v", err)
		}
		if res["success"] != true {
			t.Fatalf("expected success true, got %v", res)
		}
	})
}

func TestWave1AlertsEndpoints(t *testing.T) {
	_, handler, _ := newTestWave1Server(t)

	// 1. GET /v1/alerts/config
	t.Run("GetAlertsConfig", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/alerts/config", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var conf alerts.Config
		if err := json.Unmarshal(rec.Body.Bytes(), &conf); err != nil {
			t.Fatalf("unmarshal alerts config: %v", err)
		}
		if conf.Thresholds.CPUPercent == 0 {
			t.Fatalf("expected default CPU threshold, got 0")
		}
	})

	// 2. PUT /v1/alerts/config
	t.Run("UpdateAlertsConfig", func(t *testing.T) {
		newCfg := alerts.Config{
			Enabled: true,
			Channels: alerts.ChannelsConfig{
				Telegram: alerts.TelegramConfig{
					Enabled:  true,
					BotToken: "12345:TEST_TOKEN",
					ChatID:   "987654",
				},
				Discord: alerts.DiscordConfig{
					Enabled:    true,
					WebhookURL: "https://discord.com/api/webhooks/test",
				},
			},
			Thresholds: alerts.ThresholdsConfig{
				CPUPercent:  85,
				RAMPercent:  90,
				DiskPercent: 95,
				ServiceDown: true,
			},
			CooldownMinutes: 15,
		}
		body, _ := json.Marshal(newCfg)
		req := httptest.NewRequest(http.MethodPut, "/v1/alerts/config", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if res["success"] != true {
			t.Fatalf("expected success true, got %v", res)
		}
	})

	// 3. POST /v1/alerts/test
	t.Run("TestAlerts", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"channel": "telegram"})
		req := httptest.NewRequest(http.MethodPost, "/v1/alerts/test", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if res["success"] != true {
			t.Fatalf("expected success true, got %v", res)
		}
	})
}

func TestWave1SiteCacheEndpoints(t *testing.T) {
	_, handler, _ := newTestWave1Server(t)

	// 1. GET /v1/sites/wave1.test/cache
	t.Run("GetSiteCache", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/sites/wave1.test/cache", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var cacheConf sites.CacheSettings
		if err := json.Unmarshal(rec.Body.Bytes(), &cacheConf); err != nil {
			t.Fatalf("unmarshal cache config: %v", err)
		}
		if cacheConf.Domain != "wave1.test" {
			t.Fatalf("expected domain wave1.test, got %q", cacheConf.Domain)
		}
	})

	// 2. PUT /v1/sites/wave1.test/cache
	t.Run("SetSiteCache", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"enabled": true,
			"ttl":     "1h",
		})
		req := httptest.NewRequest(http.MethodPut, "/v1/sites/wave1.test/cache", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if res["success"] != true {
			t.Fatalf("expected success true, got %v", res)
		}
	})

	// 3. POST /v1/sites/wave1.test/cache/purge
	t.Run("PurgeSiteCache", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wave1.test/cache/purge", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if res["success"] != true {
			t.Fatalf("expected success true, got %v", res)
		}
	})
}

func TestWave1InvestigateLogsEndpoint(t *testing.T) {
	_, handler, _ := newTestWave1Server(t)

	// 1. POST /v1/sites/wave1.test/doctor/investigate-logs with sample content
	t.Run("InvestigateLogsWithSampleContent", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"logContent": "2026/11/20 04:30:12 [error] 1234#0: *5 open() \"/var/www/wave1.test/index.php\" failed (13: Permission denied)",
		})
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/wave1.test/doctor/investigate-logs", bytes.NewReader(body))
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var inv doctor.LogInvestigation
		if err := json.Unmarshal(rec.Body.Bytes(), &inv); err != nil {
			t.Fatalf("unmarshal log investigation: %v", err)
		}
		if inv.Domain != "wave1.test" {
			t.Fatalf("expected domain wave1.test, got %s", inv.Domain)
		}
		if inv.FixType != "fix_permissions" {
			t.Fatalf("expected fix_permissions, got %s", inv.FixType)
		}
	})

	// 2. Non-existent site returns 404
	t.Run("InvestigateLogsNotFound", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/sites/nonexistent.test/doctor/investigate-logs", nil)
		req.Header.Set("X-CloudDeck-Agent-Token", "test-token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
	})
}
