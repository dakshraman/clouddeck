// Package siteinfo computes read-only per-site information: disk usage,
// access-log statistics and log tails (docs/api.md section 1.7).
package siteinfo

import (
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
)

// Service answers read-only site information queries.
type Service struct {
	cfg   config.Config
	sites *sites.Service
}

// New creates the service.
func New(cfg config.Config, siteSvc *sites.Service) *Service {
	return &Service{cfg: cfg, sites: siteSvc}
}

// Usage is the GET /v1/sites/{domain}/usage body.
type Usage struct {
	Domain string `json:"domain"`
	Root   string `json:"root"`
	Bytes  int64  `json:"bytes"`
	Files  int64  `json:"files"`
}

// DayStat is one day's requests/bytes.
type DayStat struct {
	Date     string `json:"date"`
	Requests int64  `json:"requests"`
	Bytes    int64  `json:"bytes"`
}

// PathStat is one request path's count.
type PathStat struct {
	Path     string `json:"path"`
	Requests int64  `json:"requests"`
}

// Stats is the GET /v1/sites/{domain}/stats body.
type Stats struct {
	Domain   string     `json:"domain"`
	Days     int        `json:"days"`
	Requests int64      `json:"requests"`
	Bytes    int64      `json:"bytes"`
	PerDay   []DayStat  `json:"perDay"`
	TopPaths []PathStat `json:"topPaths"`
}

// Usage walks the site's webroot and reports its size and file count.
func (s *Service) Usage(domain string) (Usage, error) {
	return Usage{}, apierr.Internal("siteinfo: Usage not implemented")
}

// Stats parses the site's access log into per-day buckets and top paths.
func (s *Service) Stats(domain string, days int) (Stats, error) {
	return Stats{}, apierr.Internal("siteinfo: Stats not implemented")
}

// Logs returns the tail of the site's access or error log. kind must be
// "access" or "error"; lines is clamped to 1..2000.
func (s *Service) Logs(domain, kind string, lines int) ([]string, error) {
	return nil, apierr.Internal("siteinfo: Logs not implemented")
}
