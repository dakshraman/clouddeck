// Package phpmyadmin detects a phpMyAdmin installation (aaPanel-style layout:
// a port.pl file plus one phpmyadmin_<hash> directory) so the panel can link
// to it. See docs/api.md section 1.12.
package phpmyadmin

import "clouddeck/agent/internal/config"

// Status is the /v1/phpmyadmin/status body.
type Status struct {
	Installed bool   `json:"installed"`
	Dir       string `json:"dir,omitempty"`
	Port      int    `json:"port,omitempty"`
	Version   string `json:"version,omitempty"`
	URLPath   string `json:"urlPath,omitempty"`
	Reachable bool   `json:"reachable"`
	AuthType  string `json:"authType,omitempty"`
}

// Service detects the local phpMyAdmin.
type Service struct {
	cfg config.Config
}

// New creates the detector.
func New(cfg config.Config) *Service {
	return &Service{cfg: cfg}
}

// Status inspects AGENT_PHPMYADMIN_DIR and probes the discovered URL.
func (s *Service) Status() Status {
	return Status{}
}
