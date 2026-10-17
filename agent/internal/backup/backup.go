// Package backup creates, lists, restores and deletes backup archives for
// the backup endpoints. Creating and restoring run as tasks on the shared
// engine; listing, reading and deletion are synchronous. Mutations are
// written to the audit log.
package backup

import (
	"context"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// Archive kinds.
const (
	KindSite     = "site"
	KindDatabase = "database"
)

// Archive is one backup file's metadata. ID is the file name.
type Archive struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Source    string    `json:"source"`
	SizeBytes int64     `json:"sizeBytes"`
	CreatedAt time.Time `json:"createdAt"`
}

// UploadTarget is one post-backup upload: Telegram (Bot API) or an
// rclone remote (Google Drive/MEGA/Dropbox/...).
type UploadTarget struct {
	Type   string `json:"type"`
	Remote string `json:"remote,omitempty"`
}

// CreateRequest is the POST /v1/backups body.
type CreateRequest struct {
	Kind     string         `json:"kind"`
	Site     string         `json:"site,omitempty"`
	Database string         `json:"database,omitempty"`
	Uploads  []UploadTarget `json:"uploads,omitempty"`
}

// Service builds and manages backup archives.
type Service struct {
	cfg   config.Config
	eng   *tasks.Engine
	sites *sites.Service
	audit *audit.Log
}

// New creates the service.
func New(cfg config.Config, eng *tasks.Engine, siteSvc *sites.Service, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, eng: eng, sites: siteSvc, audit: auditLog}
}

// Create validates the request synchronously and starts a backup.create
// task. Errors: 400 invalid_request, 404 site_not_found /
// database_not_found, 409 dry_run, 412 telegram_not_configured.
func (s *Service) Create(ctx context.Context, req CreateRequest) (store.Task, error) {
	return store.Task{}, apierr.New(501, "not_implemented", "backups are not implemented yet")
}

// List returns the local archives, newest first; unparseable files are
// skipped.
func (s *Service) List() ([]Archive, error) {
	return nil, apierr.New(501, "not_implemented", "backups are not implemented yet")
}

// Get returns one archive's metadata by ID.
func (s *Service) Get(id string) (Archive, error) {
	return Archive{}, apierr.New(501, "not_implemented", "backups are not implemented yet")
}

// Path returns the validated absolute path of one archive, ready for
// download (or os.Open).
func (s *Service) Path(id string) (string, error) {
	return "", apierr.New(501, "not_implemented", "backups are not implemented yet")
}

// Restore validates the archive synchronously and starts a
// backup.restore task. Errors: 400 invalid_id, 404 backup_not_found /
// site_not_found / database_not_found, 409 dry_run.
func (s *Service) Restore(ctx context.Context, id string) (store.Task, error) {
	return store.Task{}, apierr.New(501, "not_implemented", "backups are not implemented yet")
}

// Delete removes one archive. Errors: 400 invalid_id, 404
// backup_not_found, 409 dry_run.
func (s *Service) Delete(id string) error {
	return apierr.New(501, "not_implemented", "backups are not implemented yet")
}
