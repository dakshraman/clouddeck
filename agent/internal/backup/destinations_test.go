package backup

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func newTestDestinationsService(t *testing.T) *Service {
	t.Helper()
	dir := t.TempDir()
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir:  dir,
		BackupDir: filepath.Join(dir, "backups"),
		DryRun:    true,
	}
	return New(cfg, nil, nil, auditLog)
}

func TestDestinationsCRUDAndMasking(t *testing.T) {
	svc := newTestDestinationsService(t)

	// 1. Initial list is empty
	list, err := svc.ListDestinations()
	if err != nil {
		t.Fatalf("ListDestinations: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected 0 destinations, got %d", len(list))
	}

	// 2. Validation errors
	_, err = svc.SaveDestination(Destination{Name: ""})
	if err == nil {
		t.Fatalf("expected error on missing name")
	}
	_, err = svc.SaveDestination(Destination{Name: "My R2", Bucket: ""})
	if err == nil {
		t.Fatalf("expected error on missing bucket")
	}
	_, err = svc.SaveDestination(Destination{Name: "My R2", Bucket: "backups", AccessKey: ""})
	if err == nil {
		t.Fatalf("expected error on missing access key")
	}

	// 3. Create R2 destination
	created, err := svc.SaveDestination(Destination{
		Name:      "Cloudflare R2 Primary",
		Provider:  "r2",
		Bucket:    "company-backups",
		AccessKey: "r2_access_key_123",
		SecretKey: "r2_secret_key_super_secret_9999",
		Endpoint:  "https://acc123.r2.cloudflarestorage.com",
		Prefix:    "daily/",
	})
	if err != nil {
		t.Fatalf("SaveDestination: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("expected ID to be generated")
	}
	if !strings.HasPrefix(created.SecretKey, "••••") {
		t.Fatalf("expected secret key to be masked, got %s", created.SecretKey)
	}

	// 4. List returns masked secret
	list, err = svc.ListDestinations()
	if err != nil {
		t.Fatalf("ListDestinations: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 destination, got %d", len(list))
	}
	if list[0].Name != "Cloudflare R2 Primary" {
		t.Fatalf("expected name %s, got %s", "Cloudflare R2 Primary", list[0].Name)
	}

	// 5. Update without modifying secret key keeps original secret
	updated, err := svc.SaveDestination(Destination{
		ID:        created.ID,
		Name:      "Cloudflare R2 Secondary",
		Provider:  "r2",
		Bucket:    "company-backups",
		AccessKey: "r2_access_key_123",
		SecretKey: "••••••••9999", // masked
		Endpoint:  "https://acc123.r2.cloudflarestorage.com",
	})
	if err != nil {
		t.Fatalf("update destination: %v", err)
	}
	if updated.Name != "Cloudflare R2 Secondary" {
		t.Fatalf("expected updated name, got %s", updated.Name)
	}

	// Raw check from storage to ensure secret was preserved
	rawList, err := svc.readDestinations()
	if err != nil {
		t.Fatalf("readDestinations: %v", err)
	}
	if rawList[0].SecretKey != "r2_secret_key_super_secret_9999" {
		t.Fatalf("expected secret key to be preserved, got %s", rawList[0].SecretKey)
	}

	// 6. Test destination connectivity
	res, err := svc.TestDestination(context.Background(), Destination{
		ID:        created.ID,
		AccessKey: "test_key",
		SecretKey: "test_secret",
		Bucket:    "company-backups",
		Provider:  "r2",
	})
	if err != nil {
		t.Fatalf("TestDestination: %v", err)
	}
	if !res.Success {
		t.Fatalf("expected test success, got %v: %s", res.Success, res.Message)
	}

	// 7. Delete destination
	if err := svc.DeleteDestination(created.ID); err != nil {
		t.Fatalf("DeleteDestination: %v", err)
	}
	listAfterDelete, err := svc.ListDestinations()
	if err != nil {
		t.Fatalf("ListDestinations: %v", err)
	}
	if len(listAfterDelete) != 0 {
		t.Fatalf("expected 0 destinations after delete, got %d", len(listAfterDelete))
	}
}

func TestSignS3Request(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "https://s3.us-east-1.amazonaws.com/test-bucket?max-keys=0", nil)
	now := time.Date(2026, 11, 20, 5, 0, 0, 0, time.UTC)
	signS3Request(req, "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", "s3", now)

	auth := req.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256") {
		t.Fatalf("expected AWS4-HMAC-SHA256 prefix, got %s", auth)
	}
	if !strings.Contains(auth, "Credential=AKIAIOSFODNN7EXAMPLE/20261120/us-east-1/s3/aws4_request") {
		t.Fatalf("expected valid credential scope, got %s", auth)
	}
	if req.Header.Get("x-amz-date") != "20261120T050000Z" {
		t.Fatalf("expected amz-date header, got %s", req.Header.Get("x-amz-date"))
	}
}
