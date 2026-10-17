// Package sshkeys manages SSH authorized keys and generated keypairs.
// See docs/api.md section 1.11.
package sshkeys

import (
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Key is one authorized_keys entry.
type Key struct {
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment,omitempty"`
	Line        string `json:"line"`
}

// GeneratedKey is one keypair created under AGENT_SSH_KEY_DIR. PrivateKey is
// only populated by Generate and ReadGenerated.
type GeneratedKey struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Comment     string `json:"comment,omitempty"`
	Fingerprint string `json:"fingerprint"`
	PublicKey   string `json:"publicKey"`
	PrivateKey  string `json:"privateKey,omitempty"`
}

// Status is the /v1/ssh/status body.
type Status struct {
	User     string `json:"user"`
	KeysFile string `json:"keysFile"`
	KeyDir   string `json:"keyDir"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname"`
}

// Service coordinates authorized_keys and generated keypairs.
type Service struct {
	cfg   config.Config
	audit *audit.Log
}

// New creates the SSH service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog}
}

// List returns the authorized keys, skipping unparsable lines.
func (s *Service) List() ([]Key, error) {
	return nil, apierr.Internal("ssh: not implemented")
}

// Add appends one public key line after validation (dedupe by fingerprint).
func (s *Service) Add(keyLine string) (Key, error) {
	return Key{}, apierr.Internal("ssh: not implemented")
}

// Delete removes every authorized_keys line with the given fingerprint.
func (s *Service) Delete(fingerprint string) error {
	return apierr.Internal("ssh: not implemented")
}

// ListGenerated returns generated keypairs without private material.
func (s *Service) ListGenerated() ([]GeneratedKey, error) {
	return nil, apierr.Internal("ssh: not implemented")
}

// ReadGenerated returns one generated keypair including private material.
func (s *Service) ReadGenerated(name string) (GeneratedKey, error) {
	return GeneratedKey{}, apierr.Internal("ssh: not implemented")
}

// Generate creates a keypair with ssh-keygen; the returned key includes the
// private key for one-time download.
func (s *Service) Generate(name, keyType, comment string) (GeneratedKey, error) {
	return GeneratedKey{}, apierr.Internal("ssh: not implemented")
}

// DeleteGenerated removes a generated keypair (both files).
func (s *Service) DeleteGenerated(name string) error {
	return apierr.Internal("ssh: not implemented")
}

// Status reports the keys file, key dir and the sshd port.
func (s *Service) Status() Status {
	return Status{KeysFile: s.cfg.SSHKeysFile, KeyDir: s.cfg.SSHKeyDir, Port: 22}
}
