// This file is the v0.4 scheduled-backup seam: one global schedule that
// starts backup.create tasks for every site (and optionally every database)
// and prunes older scheduled archives. Frozen in docs/api.md section 1.8.
package backup

import (
	"time"

	"clouddeck/agent/internal/apierr"
)

// Schedule is the recurring backup configuration.
type Schedule struct {
	Enabled          bool           `json:"enabled"`
	Frequency        string         `json:"frequency"` // "daily" | "weekly"
	Time             string         `json:"time"`      // "HH:MM" server-local
	Weekday          int            `json:"weekday"`   // 0=Sunday..6=Saturday, weekly only
	Keep             int            `json:"keep"`      // scheduled archives kept per source (1..365)
	IncludeDatabases bool           `json:"includeDatabases"`
	Uploads          []UploadTarget `json:"uploads,omitempty"`
	LastRunAt        *time.Time     `json:"lastRunAt,omitempty"`
	NextRunAt        *time.Time     `json:"nextRunAt,omitempty"`
	LastError        string         `json:"lastError,omitempty"`
}

// GetSchedule returns the persisted schedule, or the documented defaults
// when none was ever set.
func (s *Service) GetSchedule() (Schedule, error) {
	return Schedule{}, apierr.Internal("backup: GetSchedule not implemented")
}

// SetSchedule validates and persists the schedule, recomputing nextRunAt.
func (s *Service) SetSchedule(sc Schedule) (Schedule, error) {
	return Schedule{}, apierr.Internal("backup: SetSchedule not implemented")
}

// RunScheduledNow starts the same task set as a due run and reports how many
// tasks were started.
func (s *Service) RunScheduledNow() (int, error) {
	return 0, apierr.Internal("backup: RunScheduledNow not implemented")
}

// Start launches the minute-ticker goroutine; a no-op in dry-run mode.
func (s *Service) Start() {}
