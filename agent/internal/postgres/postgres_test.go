package postgres

import (
	"context"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func newTestPostgresHarness(t *testing.T) *Service {
	t.Helper()
	dir := t.TempDir()
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir: dir,
		DryRun:   true,
	}
	return New(cfg, auditLog)
}

func TestPostgresLifecycle(t *testing.T) {
	svc := newTestPostgresHarness(t)
	ctx := context.Background()

	// 1. Status
	st := svc.Status(ctx)
	if !st.Installed || !st.Running {
		t.Fatalf("expected installed and running: %+v", st)
	}
	if st.Port != 5432 {
		t.Fatalf("expected port 5432, got %d", st.Port)
	}

	// 2. Initial databases include postgres
	dbs, err := svc.ListDatabases(ctx)
	if err != nil {
		t.Fatalf("ListDatabases: %v", err)
	}
	if len(dbs) == 0 || dbs[0].Name != "postgres" {
		t.Fatalf("expected default postgres db, got %v", dbs)
	}

	// 3. Create database
	createdDB, err := svc.CreateDatabase(ctx, "app_production", "postgres")
	if err != nil {
		t.Fatalf("CreateDatabase: %v", err)
	}
	if createdDB.Name != "app_production" {
		t.Fatalf("expected db name app_production, got %s", createdDB.Name)
	}

	// Duplicate error
	_, err = svc.CreateDatabase(ctx, "app_production", "postgres")
	if err == nil {
		t.Fatalf("expected error on duplicate db")
	}

	// 4. Create user
	user, err := svc.CreateUser(ctx, "app_user", "SecretPass123", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if user.Username != "app_user" {
		t.Fatalf("expected username app_user, got %s", user.Username)
	}
	if !strings.HasPrefix(user.ConnectionURI, "postgres://app_user:") {
		t.Fatalf("expected postgres URI with credentials, got %s", user.ConnectionURI)
	}

	// 5. Delete database
	if err := svc.DeleteDatabase(ctx, "app_production"); err != nil {
		t.Fatalf("DeleteDatabase: %v", err)
	}
	dbsAfter, _ := svc.ListDatabases(ctx)
	for _, db := range dbsAfter {
		if db.Name == "app_production" {
			t.Fatalf("db was not deleted")
		}
	}

	// Protected database cannot be deleted
	if err := svc.DeleteDatabase(ctx, "postgres"); err == nil {
		t.Fatalf("expected error deleting protected db 'postgres'")
	}

	// 6. Delete user
	if err := svc.DeleteUser(ctx, "app_user"); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
	// Protected user cannot be deleted
	if err := svc.DeleteUser(ctx, "postgres"); err == nil {
		t.Fatalf("expected error deleting protected user 'postgres'")
	}
}
