// Package services probes and controls the host's web-stack services
// (nginx, MySQL/MariaDB, PHP-FPM) for the monitoring endpoints.
//
// List is a read-only best-effort probe. Restart executes the
// operator-configured command (AGENT_*_RESTART_CMD) with an argument
// array - never a shell - serialized and recorded in the audit log.
package services

import (
	"context"
	"sync"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Service names accepted by the API.
const (
	NameNginx  = "nginx"
	NameMySQL  = "mysql"
	NamePHPFpm = "php-fpm"
)

// States a service probe can report.
const (
	StateRunning = "running"
	StateStopped = "stopped"
	StateUnknown = "unknown"
)

// Status is one service's probed state.
type Status struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	State   string `json:"state"`
	PID     int    `json:"pid,omitempty"`
	Version string `json:"version,omitempty"`
	Details string `json:"details,omitempty"`
}

// Manager probes and restarts the host's services.
type Manager struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.Mutex
}

// New creates the manager.
func New(cfg config.Config, auditLog *audit.Log) *Manager {
	return &Manager{cfg: cfg, audit: auditLog}
}

// List probes every known service. Probing never fails the request: a
// service that cannot be probed reports state "unknown".
func (m *Manager) List(ctx context.Context) []Status {
	return []Status{
		{Name: NameNginx, Label: "Nginx (web server)", State: StateUnknown, Details: "monitoring probe not implemented yet"},
		{Name: NameMySQL, Label: "MySQL/MariaDB (database)", State: StateUnknown, Details: "monitoring probe not implemented yet"},
		{Name: NamePHPFpm, Label: "PHP-FPM (application server)", State: StateUnknown, Details: "monitoring probe not implemented yet"},
	}
}

// Restart runs the configured restart command for name and returns the
// freshly probed status. Errors: 404 unknown_service, 409 dry_run,
// 412 restart_not_configured, 502 service_restart_failed.
func (m *Manager) Restart(ctx context.Context, name string) (Status, error) {
	return Status{}, apierr.New(501, "not_implemented", "service restarts are not implemented yet")
}
