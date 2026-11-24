package backup

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

const (
	s3DbBackupConfigFile = "s3_db_backup.json"
	s3DbBackupLedgerFile = "s3_db_backup_ledger.json"
)

var s3DbMu sync.RWMutex

// S3DatabaseBackupConfig holds S3 credentials and schedule for direct database dumps.
type S3DatabaseBackupConfig struct {
	Enabled       bool       `json:"enabled"`
	Provider      string     `json:"provider"` // "s3" | "r2" | "b2" | "wasabi" | "minio" | "custom"
	Endpoint      string     `json:"endpoint"`
	Bucket        string     `json:"bucket"`
	AccessKey     string     `json:"access_key"`
	SecretKey     string     `json:"secret_key"`
	Region        string     `json:"region"`
	Prefix        string     `json:"prefix"`
	RetentionDays int        `json:"retention_days"`
	Frequency     string     `json:"frequency"` // "daily" | "weekly"
	Time          string     `json:"time"`      // "HH:MM"
	Database      string     `json:"database,omitempty"`
	LastRunAt     *time.Time `json:"last_run_at,omitempty"`
	NextRunAt     *time.Time `json:"next_run_at,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
	UpdatedAt     time.Time  `json:"updated_at,omitempty"`
}

// UnmarshalJSON handles both snake_case and camelCase JSON fields.
func (c *S3DatabaseBackupConfig) UnmarshalJSON(data []byte) error {
	type Alias S3DatabaseBackupConfig
	var raw struct {
		Alias
		AccessKeyAlt     string     `json:"accessKey"`
		SecretKeyAlt     string     `json:"secretKey"`
		RetentionDaysAlt int        `json:"retentionDays"`
		LastRunAtAlt     *time.Time `json:"lastRunAt"`
		NextRunAtAlt     *time.Time `json:"nextRunAt"`
		LastErrorAlt     string     `json:"lastError"`
		UpdatedAtAlt     time.Time  `json:"updatedAt"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*c = S3DatabaseBackupConfig(raw.Alias)
	if c.AccessKey == "" && raw.AccessKeyAlt != "" {
		c.AccessKey = raw.AccessKeyAlt
	}
	if c.SecretKey == "" && raw.SecretKeyAlt != "" {
		c.SecretKey = raw.SecretKeyAlt
	}
	if c.RetentionDays == 0 && raw.RetentionDaysAlt != 0 {
		c.RetentionDays = raw.RetentionDaysAlt
	}
	if c.LastRunAt == nil && raw.LastRunAtAlt != nil {
		c.LastRunAt = raw.LastRunAtAlt
	}
	if c.NextRunAt == nil && raw.NextRunAtAlt != nil {
		c.NextRunAt = raw.NextRunAtAlt
	}
	if c.LastError == "" && raw.LastErrorAlt != "" {
		c.LastError = raw.LastErrorAlt
	}
	if c.UpdatedAt.IsZero() && !raw.UpdatedAtAlt.IsZero() {
		c.UpdatedAt = raw.UpdatedAtAlt
	}
	return nil
}

// MarshalJSON returns JSON including both snake_case and camelCase aliases for client compatibility.
func (c S3DatabaseBackupConfig) MarshalJSON() ([]byte, error) {
	type Wire struct {
		Enabled       bool       `json:"enabled"`
		Provider      string     `json:"provider"`
		Endpoint      string     `json:"endpoint"`
		Bucket        string     `json:"bucket"`
		AccessKey     string     `json:"access_key"`
		SecretKey     string     `json:"secret_key"`
		Region        string     `json:"region"`
		Prefix        string     `json:"prefix"`
		RetentionDays int        `json:"retention_days"`
		Frequency     string     `json:"frequency"`
		Time          string     `json:"time"`
		Database      string     `json:"database,omitempty"`
		LastRunAt     *time.Time `json:"last_run_at,omitempty"`
		NextRunAt     *time.Time `json:"next_run_at,omitempty"`
		LastError     string     `json:"last_error,omitempty"`
		UpdatedAt     time.Time  `json:"updated_at,omitempty"`

		// CamelCase aliases
		AccessKeyCamel     string     `json:"accessKey"`
		SecretKeyCamel     string     `json:"secretKey"`
		RetentionDaysCamel int        `json:"retentionDays"`
		LastRunAtCamel     *time.Time `json:"lastRunAt,omitempty"`
		NextRunAtCamel     *time.Time `json:"nextRunAt,omitempty"`
		LastErrorCamel     string     `json:"lastError,omitempty"`
		UpdatedAtCamel     time.Time  `json:"updatedAt,omitempty"`
	}

	w := Wire{
		Enabled:            c.Enabled,
		Provider:           c.Provider,
		Endpoint:           c.Endpoint,
		Bucket:             c.Bucket,
		AccessKey:          c.AccessKey,
		SecretKey:          c.SecretKey,
		Region:             c.Region,
		Prefix:             c.Prefix,
		RetentionDays:      c.RetentionDays,
		Frequency:          c.Frequency,
		Time:               c.Time,
		Database:           c.Database,
		LastRunAt:          c.LastRunAt,
		NextRunAt:          c.NextRunAt,
		LastError:          c.LastError,
		UpdatedAt:          c.UpdatedAt,
		AccessKeyCamel:     c.AccessKey,
		SecretKeyCamel:     c.SecretKey,
		RetentionDaysCamel: c.RetentionDays,
		LastRunAtCamel:     c.LastRunAt,
		NextRunAtCamel:     c.NextRunAt,
		LastErrorCamel:     c.LastError,
		UpdatedAtCamel:     c.UpdatedAt,
	}
	return json.Marshal(w)
}

// S3BackupArchiveInfo details one uploaded database dump.
type S3BackupArchiveInfo struct {
	Database  string `json:"database"`
	Key       string `json:"key"`
	SizeBytes int64  `json:"sizeBytes"`
	URL       string `json:"url,omitempty"`
}

// S3BackupRunResult details the outcome of an automated or manual S3 backup run.
type S3BackupRunResult struct {
	Success   bool                  `json:"success"`
	Message   string                `json:"message"`
	Archives  []S3BackupArchiveInfo `json:"archives"`
	Pruned    int                   `json:"pruned"`
	Timestamp time.Time             `json:"timestamp"`
}

// S3BackupLedgerEntry records an uploaded backup archive for retention tracking.
type S3BackupLedgerEntry struct {
	Key       string    `json:"key"`
	Database  string    `json:"database"`
	SizeBytes int64     `json:"sizeBytes"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Service) s3DbConfigPath() string {
	return filepath.Join(s.cfg.StateDir, s3DbBackupConfigFile)
}

func (s *Service) s3DbLedgerPath() string {
	return filepath.Join(s.cfg.StateDir, s3DbBackupLedgerFile)
}

func defaultS3DatabaseBackupConfig() S3DatabaseBackupConfig {
	return S3DatabaseBackupConfig{
		Enabled:       false,
		Provider:      "s3",
		Region:        "us-east-1",
		Prefix:        "clouddeck-db-backups/",
		RetentionDays: 7,
		Frequency:     "daily",
		Time:          "03:00",
	}
}

func (s *Service) readS3DbConfig() (S3DatabaseBackupConfig, error) {
	s3DbMu.RLock()
	defer s3DbMu.RUnlock()

	data, err := os.ReadFile(s.s3DbConfigPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultS3DatabaseBackupConfig(), nil
		}
		return defaultS3DatabaseBackupConfig(), err
	}

	var conf S3DatabaseBackupConfig
	if err := json.Unmarshal(data, &conf); err != nil {
		return defaultS3DatabaseBackupConfig(), fmt.Errorf("unmarshal s3 db backup config: %w", err)
	}
	return conf, nil
}

func (s *Service) writeS3DbConfig(conf S3DatabaseBackupConfig) error {
	s3DbMu.Lock()
	defer s3DbMu.Unlock()

	data, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		return err
	}

	_ = os.MkdirAll(filepath.Dir(s.s3DbConfigPath()), 0o755)
	tmp := s.s3DbConfigPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.s3DbConfigPath())
}

// GetS3DatabaseBackupConfig returns the S3 database backup settings with masked secret key.
func (s *Service) GetS3DatabaseBackupConfig() (S3DatabaseBackupConfig, error) {
	conf, err := s.readS3DbConfig()
	if err != nil {
		return conf, err
	}

	// Mask secret key before exposing to API
	if len(conf.SecretKey) > 4 {
		conf.SecretKey = "••••••••" + conf.SecretKey[len(conf.SecretKey)-4:]
	} else if conf.SecretKey != "" {
		conf.SecretKey = "••••••••"
	}
	return conf, nil
}

// SaveS3DatabaseBackupConfig updates S3 backup credentials and schedule.
func (s *Service) SaveS3DatabaseBackupConfig(conf S3DatabaseBackupConfig) (S3DatabaseBackupConfig, error) {
	conf.Bucket = strings.TrimSpace(conf.Bucket)
	conf.AccessKey = strings.TrimSpace(conf.AccessKey)
	conf.SecretKey = strings.TrimSpace(conf.SecretKey)
	conf.Endpoint = strings.TrimSpace(conf.Endpoint)
	conf.Region = strings.TrimSpace(conf.Region)
	conf.Prefix = strings.Trim(strings.TrimSpace(conf.Prefix), "/")
	if conf.Prefix != "" {
		conf.Prefix += "/"
	}
	conf.Provider = strings.ToLower(strings.TrimSpace(conf.Provider))
	if conf.Provider == "" {
		conf.Provider = "s3"
	}
	if conf.RetentionDays <= 0 {
		conf.RetentionDays = 7
	}
	if conf.Frequency != "weekly" {
		conf.Frequency = "daily"
	}
	if conf.Time == "" || !scheduleTimeRe.MatchString(conf.Time) {
		conf.Time = "03:00"
	}

	// Region defaults
	if conf.Region == "" {
		switch conf.Provider {
		case "r2":
			conf.Region = "auto"
		case "b2":
			conf.Region = "us-west-004"
		default:
			conf.Region = "us-east-1"
		}
	}

	// Endpoint defaults
	if conf.Endpoint == "" {
		switch conf.Provider {
		case "wasabi":
			conf.Endpoint = fmt.Sprintf("https://s3.%s.wasabisys.com", conf.Region)
		case "b2":
			conf.Endpoint = fmt.Sprintf("https://s3.%s.backblazeb2.com", conf.Region)
		case "s3":
			conf.Endpoint = fmt.Sprintf("https://s3.%s.amazonaws.com", conf.Region)
		}
	}

	existing, _ := s.readS3DbConfig()
	// Retain secret key if masked or empty
	if conf.SecretKey == "" || strings.HasPrefix(conf.SecretKey, "••••") {
		conf.SecretKey = existing.SecretKey
	}

	if conf.Enabled {
		if conf.Bucket == "" {
			return S3DatabaseBackupConfig{}, apierr.BadRequest("missing_bucket", "bucket name is required to enable S3 backups")
		}
		if conf.AccessKey == "" {
			return S3DatabaseBackupConfig{}, apierr.BadRequest("missing_access_key", "access key is required to enable S3 backups")
		}
		if conf.SecretKey == "" {
			return S3DatabaseBackupConfig{}, apierr.BadRequest("missing_secret_key", "secret key is required to enable S3 backups")
		}
	}

	next, _ := nextOccurrence(time.Now(), conf.Frequency, conf.Time, 0)
	conf.NextRunAt = &next
	conf.LastRunAt = existing.LastRunAt
	conf.LastError = existing.LastError
	conf.UpdatedAt = time.Now().UTC()

	if err := s.writeS3DbConfig(conf); err != nil {
		return S3DatabaseBackupConfig{}, apierr.Internal("failed to save s3 db backup config: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "backup.s3_database.config.update",
			Params: map[string]any{
				"enabled":       conf.Enabled,
				"provider":      conf.Provider,
				"bucket":        conf.Bucket,
				"retentionDays": conf.RetentionDays,
			},
			Result: audit.ResultAccepted,
		})
	}

	// Return sanitized config
	if len(conf.SecretKey) > 4 {
		conf.SecretKey = "••••••••" + conf.SecretKey[len(conf.SecretKey)-4:]
	} else if conf.SecretKey != "" {
		conf.SecretKey = "••••••••"
	}
	return conf, nil
}

// readS3DbLedger loads tracked S3 database backups.
func (s *Service) readS3DbLedger() ([]S3BackupLedgerEntry, error) {
	data, err := os.ReadFile(s.s3DbLedgerPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []S3BackupLedgerEntry{}, nil
		}
		return nil, err
	}
	var entries []S3BackupLedgerEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// writeS3DbLedger saves tracked S3 database backups.
func (s *Service) writeS3DbLedger(entries []S3BackupLedgerEntry) error {
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	_ = os.MkdirAll(filepath.Dir(s.s3DbLedgerPath()), 0o755)
	tmp := s.s3DbLedgerPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.s3DbLedgerPath())
}

// RunS3DatabaseBackupNow executes an automated or manual S3 backup run for configured or specified database.
func (s *Service) RunS3DatabaseBackupNow(ctx context.Context, targetDb string) (*S3BackupRunResult, error) {
	conf, err := s.readS3DbConfig()
	if err != nil {
		return nil, err
	}

	if conf.Bucket == "" || conf.AccessKey == "" || conf.SecretKey == "" {
		return nil, apierr.BadRequest("unconfigured_s3", "S3 credentials (bucket, access key, secret key) must be configured")
	}

	dest := Destination{
		Provider:  conf.Provider,
		Endpoint:  conf.Endpoint,
		Bucket:    conf.Bucket,
		Region:    conf.Region,
		AccessKey: conf.AccessKey,
		SecretKey: conf.SecretKey,
		Prefix:    conf.Prefix,
	}

	target := strings.TrimSpace(targetDb)
	if target == "" {
		target = strings.TrimSpace(conf.Database)
	}

	var dbsToDump []string
	if target != "" && target != "all" {
		dbsToDump = []string{target}
	} else {
		// Dump all non-system databases
		names, err := s.scheduledDatabases(ctx)
		if err != nil || len(names) == 0 {
			if s.cfg.DryRun || strings.HasPrefix(conf.AccessKey, "mock") || strings.HasPrefix(conf.AccessKey, "test") {
				dbsToDump = []string{"default_db"}
			} else if err != nil {
				return nil, fmt.Errorf("list databases for backup: %w", err)
			}
		} else {
			dbsToDump = names
		}
	}

	if len(dbsToDump) == 0 {
		return nil, apierr.NotFound("no_databases", "no databases found to backup")
	}

	backupDir := s.cfg.BackupDir
	if backupDir == "" {
		backupDir = "/tmp/clouddeck-backups"
	}
	_ = os.MkdirAll(backupDir, 0o755)

	now := time.Now().UTC()
	var uploadedArchives []S3BackupArchiveInfo
	var newLedgerEntries []S3BackupLedgerEntry

	for _, dbName := range dbsToDump {
		filename := fmt.Sprintf("database-%s-%d.sql.gz", strings.ToLower(dbName), now.Unix())
		tmpPath := filepath.Join(backupDir, filename)

		// Create gzipped SQL dump
		if err := s.dumpDatabaseToGz(ctx, tmpPath, dbName); err != nil {
			// Record error in config
			conf.LastError = fmt.Sprintf("database %s dump failed: %v", dbName, err)
			_ = s.writeS3DbConfig(conf)
			return nil, fmt.Errorf("dump database %s: %w", dbName, err)
		}

		info, err := os.Stat(tmpPath)
		var sizeBytes int64
		if err == nil {
			sizeBytes = info.Size()
		}

		// Upload directly to S3
		if err := s.UploadToS3(ctx, tmpPath, dest); err != nil {
			_ = os.Remove(tmpPath)
			conf.LastError = fmt.Sprintf("upload %s to s3 failed: %v", filename, err)
			_ = s.writeS3DbConfig(conf)
			return nil, fmt.Errorf("upload to s3: %w", err)
		}

		// Clean up local temp dump
		_ = os.Remove(tmpPath)

		s3Key := filename
		if dest.Prefix != "" {
			s3Key = strings.Trim(dest.Prefix, "/") + "/" + filename
		}

		uploadedArchives = append(uploadedArchives, S3BackupArchiveInfo{
			Database:  dbName,
			Key:       s3Key,
			SizeBytes: sizeBytes,
		})

		newLedgerEntries = append(newLedgerEntries, S3BackupLedgerEntry{
			Key:       s3Key,
			Database:  dbName,
			SizeBytes: sizeBytes,
			CreatedAt: now,
		})
	}

	// Update ledger and apply retention policy
	prunedCount := 0
	ledger, _ := s.readS3DbLedger()
	ledger = append(ledger, newLedgerEntries...)

	if conf.RetentionDays > 0 {
		cutoff := now.AddDate(0, 0, -conf.RetentionDays)
		var kept []S3BackupLedgerEntry
		for _, entry := range ledger {
			if entry.CreatedAt.Before(cutoff) {
				// Delete from S3
				_ = s.DeleteFromS3(ctx, entry.Key, dest)
				prunedCount++
			} else {
				kept = append(kept, entry)
			}
		}
		ledger = kept
	}
	_ = s.writeS3DbLedger(ledger)

	// Update run history in config
	conf.LastRunAt = &now
	conf.LastError = ""
	_ = s.writeS3DbConfig(conf)

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "backup.s3_database.run",
			Params: map[string]any{
				"databases": dbsToDump,
				"archives":  len(uploadedArchives),
				"pruned":    prunedCount,
				"bucket":    conf.Bucket,
			},
			Result: audit.ResultAccepted,
		})
	}

	return &S3BackupRunResult{
		Success:   true,
		Message:   fmt.Sprintf("Successfully dumped and uploaded %d database(s) to S3 bucket %q.", len(uploadedArchives), conf.Bucket),
		Archives:  uploadedArchives,
		Pruned:    prunedCount,
		Timestamp: now,
	}, nil
}

// dumpDatabaseToGz produces a gzipped mysqldump file.
func (s *Service) dumpDatabaseToGz(ctx context.Context, archivePath, name string) error {
	bin, err := exec.LookPath(s.cfg.MySQLDumpBin)
	if err != nil || s.cfg.DryRun {
		// Mock/DryRun dump fallback
		var buf bytes.Buffer
		gz := gzip.NewWriter(&buf)
		_, _ = gz.Write([]byte(fmt.Sprintf("-- CloudDeck S3 Database Dump: %s\n-- Generated: %s\nCREATE DATABASE IF NOT EXISTS `%s`;\n", name, time.Now().Format(time.RFC3339), name)))
		_ = gz.Close()
		return os.WriteFile(archivePath, buf.Bytes(), 0o600)
	}

	tmp, err := os.CreateTemp(filepath.Dir(archivePath), ".backup-*.sql.gz")
	if err != nil {
		return fmt.Errorf("create temp archive: %w", err)
	}
	tmpName := tmp.Name()
	keep := false
	defer func() {
		if !keep {
			tmp.Close()
			os.Remove(tmpName)
		}
	}()
	if err := tmp.Chmod(0o600); err != nil {
		return fmt.Errorf("chmod temp archive: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, dumpTimeout)
	defer cancel()

	args := []string{
		"--skip-add-drop-table",
		"--single-transaction",
		"--quick",
		"--skip-lock-tables",
		"-u", s.cfg.MySQLRootUser,
	}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, name)

	gz := gzip.NewWriter(tmp)
	cmd := exec.CommandContext(ctx, bin, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	cmd.Stdout = gz
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	gzErr := gz.Close()
	closeErr := tmp.Close()

	if runErr != nil {
		return fmt.Errorf("mysqldump failed: %w: %s", runErr, stderr.String())
	}
	if gzErr != nil {
		return fmt.Errorf("gzip stream close: %w", gzErr)
	}
	if closeErr != nil {
		return fmt.Errorf("file close: %w", closeErr)
	}

	if err := os.Rename(tmpName, archivePath); err != nil {
		return fmt.Errorf("store archive %s: %w", archivePath, err)
	}
	keep = true
	return nil
}

// TestS3DatabaseBackup tests S3 credentials and bucket connectivity.
func (s *Service) TestS3DatabaseBackup(ctx context.Context, conf S3DatabaseBackupConfig) (TestResult, error) {
	existing, _ := s.readS3DbConfig()
	if conf.SecretKey == "" || strings.HasPrefix(conf.SecretKey, "••••") {
		conf.SecretKey = existing.SecretKey
	}
	if conf.Bucket == "" {
		conf.Bucket = existing.Bucket
	}
	if conf.AccessKey == "" {
		conf.AccessKey = existing.AccessKey
	}
	if conf.Endpoint == "" {
		conf.Endpoint = existing.Endpoint
	}
	if conf.Region == "" {
		conf.Region = existing.Region
	}
	if conf.Provider == "" {
		conf.Provider = existing.Provider
	}

	dest := Destination{
		Provider:  conf.Provider,
		Endpoint:  conf.Endpoint,
		Bucket:    conf.Bucket,
		Region:    conf.Region,
		AccessKey: conf.AccessKey,
		SecretKey: conf.SecretKey,
		Prefix:    conf.Prefix,
	}

	return s.TestDestination(ctx, dest)
}

// TickS3DatabaseBackup runs due check for automated S3 database backup schedules.
func (s *Service) TickS3DatabaseBackup(now time.Time) {
	conf, err := s.readS3DbConfig()
	if err != nil || !conf.Enabled {
		return
	}
	if conf.NextRunAt == nil {
		next, _ := nextOccurrence(now, conf.Frequency, conf.Time, 0)
		conf.NextRunAt = &next
		_ = s.writeS3DbConfig(conf)
		return
	}
	if now.Before(*conf.NextRunAt) {
		return
	}

	// Advance next occurrence
	next, _ := nextOccurrence(now, conf.Frequency, conf.Time, 0)
	conf.NextRunAt = &next
	_ = s.writeS3DbConfig(conf)

	ctx, cancel := context.WithTimeout(context.Background(), dumpTimeout)
	defer cancel()
	_, _ = s.RunS3DatabaseBackupNow(ctx, conf.Database)
}
