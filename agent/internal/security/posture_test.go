package security

import (
	"context"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestSecurityPostureLifecycle(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{
		StateDir: dir,
		Webroot:  filepath.Join(dir, "www"),
		DryRun:   true,
	}
	svc := New(cfg)
	ctx := context.Background()

	// 1. Scan posture
	report, err := svc.Scan(ctx)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if report.Score < 0 || report.Score > 100 {
		t.Fatalf("expected score 0-100, got %d", report.Score)
	}
	if report.Grade == "" {
		t.Fatalf("expected grade to be calculated")
	}
	if len(report.Findings) == 0 {
		t.Fatalf("expected security findings")
	}

	// 2. GetPosture returns report
	cached := svc.GetPosture(ctx)
	if cached.Score != report.Score {
		t.Fatalf("expected cached score %d, got %d", report.Score, cached.Score)
	}

	// 3. AutoHarden
	hardenRes, err := svc.AutoHarden(ctx)
	if err != nil {
		t.Fatalf("AutoHarden: %v", err)
	}
	if !hardenRes.Success || hardenRes.NewScore < 90 {
		t.Fatalf("expected auto-hardening success with >=90 score, got %+v", hardenRes)
	}
	if len(hardenRes.ActionsApplied) == 0 {
		t.Fatalf("expected actions applied in harden result")
	}
}
