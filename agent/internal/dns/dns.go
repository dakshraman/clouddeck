// Package dns manages PowerDNS zones and records for the DNS endpoints.
// Every pdnsutil invocation is serialized behind a mutex and uses argument
// arrays only - never a shell. Mutations are written to the audit log.
package dns

import (
	"context"
	"sync"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Zone is one DNS zone.
type Zone struct {
	Name string `json:"name"`
}

// Record is one record; Name is relative to the zone ("@" = apex).
type Record struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	TTL     int    `json:"ttl"`
	Content string `json:"content"`
}

// Status reports whether the PowerDNS tooling is usable.
type Status struct {
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
	ConfDir   string `json:"confDir,omitempty"`
}

// Manager talks to PowerDNS through pdnsutil.
type Manager struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.Mutex
}

// New creates the manager.
func New(cfg config.Config, auditLog *audit.Log) *Manager {
	return &Manager{cfg: cfg, audit: auditLog}
}

// Status probes pdnsutil availability. Never fails.
func (m *Manager) Status(ctx context.Context) Status {
	return Status{Available: false, ConfDir: m.cfg.PdnsConfDir}
}

// Zones lists all zones. 503 dns_unavailable when pdnsutil is missing.
func (m *Manager) Zones(ctx context.Context) ([]Zone, error) {
	return nil, apierr.New(501, "not_implemented", "dns support is not implemented yet")
}

// CreateZone creates a native zone (SOA included). Errors: 400
// invalid_zone, 409 zone_exists / dry_run, 503 dns_unavailable.
func (m *Manager) CreateZone(ctx context.Context, name string) (Zone, error) {
	return Zone{}, apierr.New(501, "not_implemented", "dns support is not implemented yet")
}

// DeleteZone deletes a zone. Errors: 400 invalid_zone, 404
// zone_not_found, 409 dry_run, 503 dns_unavailable.
func (m *Manager) DeleteZone(ctx context.Context, name string) error {
	return apierr.New(501, "not_implemented", "dns support is not implemented yet")
}

// Records lists one zone's records (SOA/NS included; Name relative).
func (m *Manager) Records(ctx context.Context, zone string) ([]Record, error) {
	return nil, apierr.New(501, "not_implemented", "dns support is not implemented yet")
}

// AddRecord adds a record. Errors: 400 invalid_record, 404
// zone_not_found, 409 dry_run, 503 dns_unavailable.
func (m *Manager) AddRecord(ctx context.Context, zone, name, rtype, content string, ttl int) (Record, error) {
	return Record{}, apierr.New(501, "not_implemented", "dns support is not implemented yet")
}

// DeleteRRSet deletes the whole record set for name/type. Errors: 400
// invalid_record, 404 zone_not_found / record_not_found, 409 dry_run,
// 503 dns_unavailable.
func (m *Manager) DeleteRRSet(ctx context.Context, zone, name, rtype string) error {
	return apierr.New(501, "not_implemented", "dns support is not implemented yet")
}
