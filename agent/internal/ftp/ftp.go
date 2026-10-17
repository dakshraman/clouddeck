// Package ftp manages virtual FTP accounts for pure-ftpd: a file-backed
// passwd file (login:crypt:uid:gid:gecos:home:shell) plus an optional reload
// command that regenerates the pure-ftpd PureDB. See docs/api.md section 1.9.
package ftp

import (
	"sync"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Account is one virtual FTP login as stored in the passwd file.
type Account struct {
	Name   string `json:"name"`
	Home   string `json:"home"`
	UID    int    `json:"uid"`
	GID    int    `json:"gid"`
	Site   string `json:"site,omitempty"`   // derived by the server layer from Home
	Subdir string `json:"subdir,omitempty"` // derived by the server layer from Home
}

// Status is the /v1/ftp/status body.
type Status struct {
	PasswdFile string `json:"passwdFile"`
	RunAs      string `json:"runAs"`
	Accounts   int    `json:"accounts"`
}

// Service coordinates the FTP passwd file.
type Service struct {
	cfg   config.Config
	audit *audit.Log

	// mu serializes read-modify-write cycles on the passwd file.
	mu sync.Mutex
}

// New creates the FTP service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog}
}

// List returns every account, sorted by login name.
func (s *Service) List() ([]Account, error) {
	return nil, apierr.Internal("ftp: not implemented")
}

// Create adds one account whose home is siteRoot/subdir (created when
// missing). The home must stay inside siteRoot.
func (s *Service) Create(siteRoot, subdir, name, password string) (Account, error) {
	return Account{}, apierr.Internal("ftp: not implemented")
}

// Delete removes one account by login name; its home directory is kept.
func (s *Service) Delete(name string) error {
	return apierr.Internal("ftp: not implemented")
}

// SetPassword rotates one account's password.
func (s *Service) SetPassword(name, password string) error {
	return apierr.Internal("ftp: not implemented")
}

// Status reports the passwd file location and account count.
func (s *Service) Status() Status {
	return Status{PasswdFile: s.cfg.FTPPasswdFile, RunAs: s.cfg.FTPRunAs}
}
