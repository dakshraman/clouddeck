package backup

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func newTestS3DbService(t *testing.T) *Service {
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

func TestS3DatabaseBackupConfigCRUDAndMasking(t *testing.T) {
	svc := newTestS3DbService(t)

	// 1. Initial config
	initial, err := svc.GetS3DatabaseBackupConfig()
	if err != nil {
		t.Fatalf("GetS3DatabaseBackupConfig: %v", err)
	}
	if initial.Enabled || initial.RetentionDays != 7 {
		t.Fatalf("unexpected initial config: %+v", initial)
	}

	// 2. Validation failure when enabling without credentials
	_, err = svc.SaveS3DatabaseBackupConfig(S3DatabaseBackupConfig{
		Enabled: true,
	})
	if err == nil {
		t.Fatalf("expected error enabling without credentials")
	}

	// 3. Save valid S3 database backup config
	saved, err := svc.SaveS3DatabaseBackupConfig(S3DatabaseBackupConfig{
		Enabled:       true,
		Provider:      "r2",
		Bucket:        "my-database-backups",
		AccessKey:     "r2_access_key_xyz",
		SecretKey:     "r2_secret_key_secret_1234",
		Endpoint:      "https://acc123.r2.cloudflarestorage.com",
		Prefix:        "daily-db/",
		RetentionDays: 14,
		Frequency:     "daily",
		Time:          "04:00",
		Database:      "all",
	})
	if err != nil {
		t.Fatalf("SaveS3DatabaseBackupConfig: %v", err)
	}
	if !saved.Enabled || saved.RetentionDays != 14 {
		t.Fatalf("unexpected saved config: %+v", saved)
	}
	if !strings.HasPrefix(saved.SecretKey, "••••") {
		t.Fatalf("expected secret key to be masked, got: %s", saved.SecretKey)
	}

	// 4. Update with masked secret key preserves original secret
	updated, err := svc.SaveS3DatabaseBackupConfig(S3DatabaseBackupConfig{
		Enabled:       true,
		Provider:      "r2",
		Bucket:        "my-database-backups",
		AccessKey:     "r2_access_key_xyz",
		SecretKey:     "••••••••1234", // masked
		Endpoint:      "https://acc123.r2.cloudflarestorage.com",
		Prefix:        "daily-db/",
		RetentionDays: 30,
	})
	if err != nil {
		t.Fatalf("update with masked secret: %v", err)
	}
	if updated.RetentionDays != 30 {
		t.Fatalf("expected retention days 30, got %d", updated.RetentionDays)
	}

	raw, err := svc.readS3DbConfig()
	if err != nil {
		t.Fatalf("readS3DbConfig: %v", err)
	}
	if raw.SecretKey != "r2_secret_key_secret_1234" {
		t.Fatalf("expected original secret preserved, got: %s", raw.SecretKey)
	}

	// 5. Verify dual snake_case and camelCase unmarshaling
	jsonData := []byte(`{
		"enabled": true,
		"provider": "aws-s3",
		"bucket": "aws-db-backups",
		"accessKey": "AKIA12345678",
		"secretKey": "supersecretkey9999",
		"retentionDays": 60
	}`)
	var parsed S3DatabaseBackupConfig
	if err := json.Unmarshal(jsonData, &parsed); err != nil {
		t.Fatalf("unmarshal camelCase JSON: %v", err)
	}
	if parsed.AccessKey != "AKIA12345678" || parsed.SecretKey != "supersecretkey9999" || parsed.RetentionDays != 60 {
		t.Fatalf("failed to parse camelCase fields: %+v", parsed)
	}
}

func TestRunS3DatabaseBackupNowAndRetention(t *testing.T) {
	svc := newTestS3DbService(t)
	ctx := context.Background()

	// 1. Save config
	_, err := svc.SaveS3DatabaseBackupConfig(S3DatabaseBackupConfig{
		Enabled:       true,
		Provider:      "s3",
		Bucket:        "test-bucket",
		AccessKey:     "test_access_key",
		SecretKey:     "test_secret_key",
		Prefix:        "db-dumps/",
		RetentionDays: 7,
		Database:      "shop_prod",
	})
	if err != nil {
		t.Fatalf("SaveS3DatabaseBackupConfig: %v", err)
	}

	// 2. Pre-seed ledger with an expired backup (10 days old)
	oldTime := time.Now().UTC().AddDate(0, 0, -10)
	preseeded := []S3BackupLedgerEntry{
		{
			Key:       "db-dumps/database-shop_prod-10daysago.sql.gz",
			Database:  "shop_prod",
			SizeBytes: 1024,
			CreatedAt: oldTime,
		},
	}
	if err := svc.writeS3DbLedger(preseeded); err != nil {
		t.Fatalf("writeS3DbLedger: %v", err)
	}

	// 3. Run backup now
	res, err := svc.RunS3DatabaseBackupNow(ctx, "shop_prod")
	if err != nil {
		t.Fatalf("RunS3DatabaseBackupNow: %v", err)
	}
	if !res.Success {
		t.Fatalf("expected success, got message: %s", res.Message)
	}
	if len(res.Archives) != 1 {
		t.Fatalf("expected 1 archive, got %d", len(res.Archives))
	}
	if res.Pruned != 1 {
		t.Fatalf("expected 1 expired archive pruned, got %d", res.Pruned)
	}

	// 4. Verify ledger state
	ledger, err := svc.readS3DbLedger()
	if err != nil {
		t.Fatalf("readS3DbLedger: %v", err)
	}
	if len(ledger) != 1 {
		t.Fatalf("expected 1 active archive in ledger, got %d", len(ledger))
	}
	if ledger[0].Key == "db-dumps/database-shop_prod-10daysago.sql.gz" {
		t.Fatalf("expired archive was not pruned from ledger")
	}

	// 5. Test S3 connectivity test
	testRes, err := svc.TestS3DatabaseBackup(ctx, S3DatabaseBackupConfig{
		Bucket:    "test-bucket",
		AccessKey: "test_key",
		SecretKey: "test_secret",
		Provider:  "s3",
	})
	if err != nil {
		t.Fatalf("TestS3DatabaseBackup: %v", err)
	}
	if !testRes.Success {
		t.Fatalf("expected test success in dry run / mock, got: %+v", testRes)
	}
}
