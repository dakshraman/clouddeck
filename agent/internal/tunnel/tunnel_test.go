package tunnel

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
)

func TestTunnelDryRun(t *testing.T) {
	svc := New(config.Config{DryRun: true})
	ctx := context.Background()

	// Initially empty
	if list := svc.ListTunnels(); len(list) != 0 {
		t.Fatalf("expected 0 tunnels, got %d", len(list))
	}

	// Start tunnel
	tun, err := svc.StartTunnel(ctx, "mysite.com")
	if err != nil {
		t.Fatalf("StartTunnel error: %v", err)
	}
	if tun.Domain != "mysite.com" {
		t.Errorf("Domain = %q, want mysite.com", tun.Domain)
	}
	if tun.Status != "running" {
		t.Errorf("Status = %q, want running", tun.Status)
	}
	if tun.PublicURL != "https://mysite-com.trycloudflare.com" {
		t.Errorf("PublicURL = %q", tun.PublicURL)
	}

	// Get tunnel
	got, ok := svc.GetTunnel("mysite.com")
	if !ok || got == nil {
		t.Fatalf("GetTunnel returned ok=%v, got=%v", ok, got)
	}
	if got.Domain != "mysite.com" {
		t.Errorf("GetTunnel domain = %q", got.Domain)
	}

	// List tunnels
	list := svc.ListTunnels()
	if len(list) != 1 {
		t.Fatalf("expected 1 tunnel, got %d", len(list))
	}
	if list[0].Domain != "mysite.com" {
		t.Errorf("list[0].Domain = %q", list[0].Domain)
	}

	// Stop tunnel
	if err := svc.StopTunnel(ctx, "mysite.com"); err != nil {
		t.Fatalf("StopTunnel error: %v", err)
	}

	// Verify stopped
	if _, ok := svc.GetTunnel("mysite.com"); ok {
		t.Error("GetTunnel returned ok=true after StopTunnel")
	}
	if list := svc.ListTunnels(); len(list) != 0 {
		t.Errorf("ListTunnels returned %d items after StopTunnel", len(list))
	}

	// Stop nonexistent tunnel
	err = svc.StopTunnel(ctx, "mysite.com")
	if err == nil {
		t.Fatal("expected error stopping nonexistent tunnel")
	}
	apiErr, ok := apierr.As(err)
	if !ok || apiErr.Status != 404 {
		t.Errorf("expected 404 api error, got %v", err)
	}
}

func TestTunnelMockScript(t *testing.T) {
	tempDir := t.TempDir()
	scriptPath := filepath.Join(tempDir, "mock-cloudflared")
	script := `#!/bin/sh
echo "2026-10-31T12:00:00Z INF +--------------------------------------------------------------------------------------------+" >&2
echo "2026-10-31T12:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |" >&2
echo "2026-10-31T12:00:00Z INF |  https://unit-test-tunnel.trycloudflare.com                                              |" >&2
echo "2026-10-31T12:00:00Z INF +--------------------------------------------------------------------------------------------+" >&2
exec sleep 30
`
	if err := os.WriteFile(scriptPath, []byte(script), 0755); err != nil {
		t.Fatalf("failed to write mock script: %v", err)
	}

	svc := New(config.Config{DryRun: false})
	svc.SetBinaryPath(scriptPath)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tun, err := svc.StartTunnel(ctx, "testdomain.org")
	if err != nil {
		t.Fatalf("StartTunnel with mock script failed: %v", err)
	}
	defer func() {
		_ = svc.StopTunnel(context.Background(), "testdomain.org")
	}()

	if tun.Domain != "testdomain.org" {
		t.Errorf("Domain = %q, want testdomain.org", tun.Domain)
	}
	if tun.PublicURL != "https://unit-test-tunnel.trycloudflare.com" {
		t.Errorf("PublicURL = %q, want https://unit-test-tunnel.trycloudflare.com", tun.PublicURL)
	}
	if tun.Status != "running" {
		t.Errorf("Status = %q, want running", tun.Status)
	}

	// Get tunnel
	got, ok := svc.GetTunnel("testdomain.org")
	if !ok || got == nil {
		t.Fatalf("GetTunnel failed to find running tunnel")
	}

	// Stop tunnel
	if err := svc.StopTunnel(context.Background(), "testdomain.org"); err != nil {
		t.Fatalf("StopTunnel error: %v", err)
	}

	if _, ok := svc.GetTunnel("testdomain.org"); ok {
		t.Error("tunnel still found after StopTunnel")
	}
}

func TestGlobalTunnelLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	svc := New(config.Config{StateDir: tempDir, DryRun: true})
	ctx := context.Background()

	// Initial status should be not_configured
	st := svc.GetGlobalStatus()
	if st.Configured {
		t.Errorf("expected configured=false, got true")
	}
	if st.Running {
		t.Errorf("expected running=false, got true")
	}
	if st.Status != "not_configured" {
		t.Errorf("expected status 'not_configured', got %q", st.Status)
	}

	// Starting without token should fail
	_, err := svc.StartGlobalTunnel(ctx)
	if err == nil {
		t.Fatal("expected error starting tunnel without token")
	}

	// Saving empty token should fail
	_, err = svc.SaveGlobalConfig(GlobalConfig{Token: ""})
	if err == nil {
		t.Fatal("expected error saving empty token")
	}

	// Save valid token
	savedSt, err := svc.SaveGlobalConfig(GlobalConfig{
		Token:     "eyJhIjoiZXhhbXBsZXRva2VuMTIzNCJ9",
		AutoStart: true,
	})
	if err != nil {
		t.Fatalf("SaveGlobalConfig error: %v", err)
	}
	if !savedSt.Configured {
		t.Errorf("expected configured=true")
	}
	if savedSt.Status != "stopped" {
		t.Errorf("expected status 'stopped', got %q", savedSt.Status)
	}
	if savedSt.Token != "eyJhIjoiZXhhbXBsZXRva2VuMTIzNCJ9" {
		t.Errorf("unexpected token: %s", savedSt.Token)
	}

	// Start tunnel in dry run
	startedSt, err := svc.StartGlobalTunnel(ctx)
	if err != nil {
		t.Fatalf("StartGlobalTunnel error: %v", err)
	}
	if !startedSt.Running {
		t.Errorf("expected running=true")
	}
	if startedSt.Status != "running" {
		t.Errorf("expected status 'running', got %q", startedSt.Status)
	}
	if startedSt.StartedAt == nil {
		t.Errorf("expected startedAt to be set")
	}

	// Starting when already running is idempotent
	sameSt, err := svc.StartGlobalTunnel(ctx)
	if err != nil {
		t.Fatalf("second StartGlobalTunnel error: %v", err)
	}
	if !sameSt.Running {
		t.Errorf("expected running=true on second start")
	}

	// Stop tunnel
	stoppedSt, err := svc.StopGlobalTunnel(ctx)
	if err != nil {
		t.Fatalf("StopGlobalTunnel error: %v", err)
	}
	if stoppedSt.Running {
		t.Errorf("expected running=false after stop")
	}
	if stoppedSt.Status != "stopped" {
		t.Errorf("expected status 'stopped', got %q", stoppedSt.Status)
	}

	// Persistence verification: create new service with same StateDir
	svc2 := New(config.Config{StateDir: tempDir, DryRun: true})
	st2 := svc2.GetGlobalStatus()
	if !st2.Configured {
		t.Errorf("expected svc2 configured=true from disk")
	}
	if st2.Token != "eyJhIjoiZXhhbXBsZXRva2VuMTIzNCJ9" {
		t.Errorf("expected persisted token, got %q", st2.Token)
	}
}
