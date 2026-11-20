package fleet

import (
	"context"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestFleetService(t *testing.T) {
	dir := t.TempDir()
	cfg := config.Config{StateDir: dir, DryRun: true}
	svc := New(cfg, nil)

	// 1. Initial list has primary node
	nodes := svc.ListNodes()
	if len(nodes) != 1 {
		t.Fatalf("expected 1 initial primary node, got %d", len(nodes))
	}
	if nodes[0].ID != "node_primary" {
		t.Errorf("expected primary node ID 'node_primary', got %s", nodes[0].ID)
	}

	// 2. Register worker node
	ctx := context.Background()
	worker, err := svc.RegisterNode(ctx, RegisterNodeInput{
		Name:  "Worker Node 1",
		Host:  "192.168.1.50",
		Port:  8080,
		Token: "worker-token-xyz",
		Tags:  []string{"worker", "db"},
	})
	if err != nil {
		t.Fatalf("RegisterNode failed: %v", err)
	}
	if worker.Name != "Worker Node 1" {
		t.Errorf("unexpected worker name: %s", worker.Name)
	}

	// 3. Overview
	overview := svc.GetOverview(ctx)
	if overview.TotalNodes != 2 {
		t.Errorf("expected 2 total nodes in overview, got %d", overview.TotalNodes)
	}
	if overview.OnlineNodes != 2 {
		t.Errorf("expected 2 online nodes, got %d", overview.OnlineNodes)
	}

	// 4. Update worker node
	updated, err := svc.UpdateNode(ctx, worker.ID, UpdateNodeInput{
		Name: "Worker Node 1 Updated",
		Tags: []string{"worker", "edge"},
	})
	if err != nil {
		t.Fatalf("UpdateNode failed: %v", err)
	}
	if updated.Name != "Worker Node 1 Updated" {
		t.Errorf("expected updated name, got %s", updated.Name)
	}

	// 5. Ping node
	pinged, err := svc.PingNode(ctx, worker.ID)
	if err != nil {
		t.Fatalf("PingNode failed: %v", err)
	}
	if pinged.Status != "online" {
		t.Errorf("expected online status, got %s", pinged.Status)
	}

	// 6. Delete worker node
	if err := svc.DeleteNode(ctx, worker.ID); err != nil {
		t.Fatalf("DeleteNode failed: %v", err)
	}

	// Cannot delete primary
	if err := svc.DeleteNode(ctx, "node_primary"); err == nil {
		t.Errorf("expected error when deleting primary node")
	}
}
