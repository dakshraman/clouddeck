package rbac

import (
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func newTestRBACHarness(t *testing.T) *Service {
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

func TestRBACUserLifecycle(t *testing.T) {
	svc := newTestRBACHarness(t)

	// 1. Initial list empty
	users, err := svc.ListUsers()
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 0 {
		t.Fatalf("expected 0 users, got %d", len(users))
	}

	// 2. Validation errors
	_, err = svc.CreateUser(User{Username: "ab", Password: "123"})
	if err == nil {
		t.Fatalf("expected error on too short username")
	}
	_, err = svc.CreateUser(User{Username: "validuser", Password: ""})
	if err == nil {
		t.Fatalf("expected error on empty password")
	}

	// 3. Create client sub-account
	created, err := svc.CreateUser(User{
		Username: "client_alice",
		Email:    "alice@agency.test",
		Role:     "client",
		Domains:  []string{"alice-shop.com", "alice-blog.com"},
		Quotas: Quotas{
			DiskMB:       5120,
			MaxDatabases: 3,
			MaxMailboxes: 5,
		},
		Password: "SecureClientPassword123!",
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if created.Username != "client_alice" || created.Password != "" {
		t.Fatalf("unexpected created user: %+v", created)
	}

	// Duplicate rejected
	_, err = svc.CreateUser(User{Username: "client_alice", Password: "p"})
	if err == nil {
		t.Fatalf("expected error on duplicate username")
	}

	// 4. Update user
	updated, err := svc.UpdateUser("client_alice", User{
		Email:   "alice-new@agency.test",
		Domains: []string{"alice-shop.com", "alice-blog.com", "alice-portal.com"},
		Quotas: Quotas{
			DiskMB:       10240,
			MaxDatabases: 5,
			MaxMailboxes: 10,
		},
	})
	if err != nil {
		t.Fatalf("UpdateUser: %v", err)
	}
	if len(updated.Domains) != 3 || updated.Quotas.DiskMB != 10240 {
		t.Fatalf("unexpected updated user: %+v", updated)
	}

	// 5. Delete user
	if err := svc.DeleteUser("client_alice"); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}
	listAfterDelete, err := svc.ListUsers()
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(listAfterDelete) != 0 {
		t.Fatalf("expected 0 users after delete, got %d", len(listAfterDelete))
	}
}
