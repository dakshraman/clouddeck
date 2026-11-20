package alerts

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
)

func TestAlertsConfigAndDispatch(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir}
	svc := New(cfg, nil)
	ctx := context.Background()

	// 1. Check default config
	initial := svc.GetConfig()
	if initial.CooldownMinutes != 15 || initial.Thresholds.CPUPercent != 85 {
		t.Fatalf("unexpected initial config: %+v", initial)
	}

	// 2. Setup mock webhook server
	var receivedPayload []byte
	var receivedSig string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPayload, _ = io.ReadAll(r.Body)
		receivedSig = r.Header.Get("X-CloudDeck-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// 3. Update config with enabled webhook
	secret := "secret-key-123"
	updated := Config{
		Enabled:         true,
		CooldownMinutes: 10,
		Thresholds: ThresholdsConfig{
			CPUPercent:  90,
			RAMPercent:  95,
			DiskPercent: 95,
			ServiceDown: true,
		},
		Channels: ChannelsConfig{
			Webhook: WebhookConfig{
				Enabled: true,
				URL:     server.URL,
				Secret:  secret,
			},
		},
	}
	if err := svc.UpdateConfig(ctx, updated); err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}

	// Verify persistence by loading in new service instance
	svc2 := New(cfg, nil)
	loaded := svc2.GetConfig()
	if loaded.Thresholds.CPUPercent != 90 || loaded.Channels.Webhook.URL != server.URL {
		t.Fatalf("persisted config mismatch: %+v", loaded)
	}

	// 4. Dispatch Alert
	alert := Alert{
		Type:      "cpu",
		Severity:  "critical",
		Title:     "CPU Spike Alert",
		Message:   "CPU utilization reached 94%",
		Timestamp: time.Now(),
	}
	results := svc2.Dispatch(ctx, alert)
	if results["webhook"] != "sent" {
		t.Fatalf("expected webhook sent, got: %+v", results)
	}

	// Verify HMAC signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(receivedPayload)
	expectedSig := hex.EncodeToString(mac.Sum(nil))
	if receivedSig != expectedSig {
		t.Fatalf("signature mismatch: got %q, want %q", receivedSig, expectedSig)
	}

	// 5. Test Cooldown Suppression
	suppressed := svc2.Dispatch(ctx, alert)
	if suppressed["status"] != "suppressed_by_cooldown" {
		t.Fatalf("expected suppressed_by_cooldown, got: %+v", suppressed)
	}

	// 6. Test DryRun Test Alert
	svcDry := New(config.Config{StateDir: dir, DryRun: true}, nil)
	testRes, err := svcDry.Test(ctx, "webhook")
	if err != nil {
		t.Fatalf("test alert failed: %v", err)
	}
	if testRes["status"] != "dry-run: alert test passed" {
		t.Fatalf("expected dry-run passed, got: %+v", testRes)
	}
}
