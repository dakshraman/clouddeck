// This file is the v0.4 scheduled-backup seam: one global schedule that
// starts backup.create tasks for every site (and optionally every database)
// and prunes older scheduled archives. Frozen in docs/api.md section 1.8.
package backup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	stdlog "log"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/mysql"
)

// State file names inside AGENT_STATE_DIR (docs/api.md section 1.8).
const (
	scheduleFileName = "backup_schedule.json"
	ledgerFileName   = "backup_schedule_ledger.json"
)

// scheduleTimeRe is the frozen "HH:MM" server-local clock format.
var scheduleTimeRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

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

// defaultSchedule is the documented configuration used until a schedule is
// first set: disabled, daily at 03:00, keeping seven archives per source.
func defaultSchedule() Schedule {
	return Schedule{
		Enabled:   false,
		Frequency: "daily",
		Time:      "03:00",
		Weekday:   0,
		Keep:      7,
	}
}

// GetSchedule returns the persisted schedule, or the documented defaults
// when none was ever set.
func (s *Service) GetSchedule() (Schedule, error) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	return s.loadScheduleLocked()
}

// SetSchedule validates and persists the schedule, recomputing nextRunAt.
// Errors: 400 invalid_schedule, 409 dry_run. lastRunAt/lastError are the run
// history: read-only for callers and carried over unchanged.
func (s *Service) SetSchedule(sc Schedule) (Schedule, error) {
	if s.cfg.DryRun {
		return Schedule{}, dryRunErr()
	}
	params := scheduleParams(sc)
	if err := validateSchedule(sc); err != nil {
		return Schedule{}, s.reject(ActionScheduleSet, params, err)
	}
	if err := s.validateUploads(sc.Uploads); err != nil {
		// The PUT surface only documents 400 invalid_schedule, so an invalid
		// or unconfigured upload keeps the validator's message under that
		// code.
		return Schedule{}, s.reject(ActionScheduleSet, params, apierr.BadRequest("invalid_schedule", err.Error()))
	}

	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	prev, err := s.loadScheduleLocked()
	if err != nil {
		return Schedule{}, err
	}
	sc.LastRunAt, sc.LastError = prev.LastRunAt, prev.LastError

	next, err := nextOccurrence(time.Now(), sc.Frequency, sc.Time, sc.Weekday)
	if err != nil {
		// validateSchedule already rejected malformed fields.
		return Schedule{}, apierr.BadRequest("invalid_schedule", err.Error())
	}
	sc.NextRunAt = &next

	if err := s.audit.Append(audit.Record{Action: ActionScheduleSet, Params: params, Result: audit.ResultAccepted}); err != nil {
		return Schedule{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := s.saveScheduleLocked(sc); err != nil {
		return Schedule{}, apierr.Internal(err.Error())
	}
	s.nextLocal = next
	return sc, nil
}

// RunScheduledNow starts the same task set as a due run and reports how many
// tasks were started. The outcome (lastRunAt, lastError) is persisted;
// nextRunAt deliberately stays put, because a manual run does not move the
// schedule. Errors: 409 dry_run.
func (s *Service) RunScheduledNow() (int, error) {
	if s.cfg.DryRun {
		return 0, dryRunErr()
	}
	sc, err := s.GetSchedule()
	if err != nil {
		return 0, err
	}

	// Manual runs queue behind a scheduled run that is still admitting its
	// tasks, so two runs can never overlap.
	s.runMu.Lock()
	defer s.runMu.Unlock()

	started, summary := s.startScheduledRun(context.Background(), sc)
	if err := s.recordRunResult(time.Now(), summary); err != nil {
		return started, apierr.Internal(fmt.Sprintf("persist run result: %v", err))
	}
	return started, nil
}

// Start launches the minute-ticker goroutine; a no-op in dry-run mode.
func (s *Service) Start() {
	if s.cfg.DryRun {
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			s.tick(time.Now())
		}
	}()
}

// tick runs one due-check. Only one scheduled run is admitted at a time: a
// tick that finds a run still going is skipped, and the next tick retries
// because nextRunAt stays in the past.
func (s *Service) tick(now time.Time) {
	sc, err := s.GetSchedule()
	if err != nil {
		stdlog.Printf("backup: scheduled run: %v", err)
		return
	}
	if !sc.Enabled {
		return
	}
	if sc.NextRunAt == nil {
		// An enabled schedule without a next occurrence (hand-edited state):
		// repair it instead of firing immediately.
		s.advanceNext(now)
		return
	}
	if !s.isDue(now, sc) {
		return
	}
	if !s.runMu.TryLock() {
		stdlog.Printf("backup: previous scheduled run is still starting; skipping this tick")
		return
	}
	defer s.runMu.Unlock()

	started, summary := s.startScheduledRun(context.Background(), sc)
	stdlog.Printf("backup: scheduled run started %d backup task(s)", started)
	if summary != "" {
		stdlog.Printf("backup: scheduled run had admission failures: %s", summary)
	}
	if err := s.recordRunResult(now, summary); err != nil {
		stdlog.Printf("backup: persist scheduled run result: %v", err)
	}
	s.advanceNext(now)
}

// isDue reports whether the schedule should fire at now. The in-memory next
// occurrence wins once set, so a failed state write can never make every tick
// start another run.
func (s *Service) isDue(now time.Time, sc Schedule) bool {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	due := s.nextLocal
	if due.IsZero() {
		if sc.NextRunAt == nil {
			return false
		}
		due = *sc.NextRunAt
	}
	return !now.Before(due)
}

// advanceNext recomputes nextRunAt after a scheduled run and persists it. The
// in-memory copy is updated even when the write fails, so a broken state file
// costs one backup per occurrence instead of one per tick.
func (s *Service) advanceNext(now time.Time) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	sc, err := s.loadScheduleLocked()
	if err != nil {
		stdlog.Printf("backup: recompute next run: %v", err)
		return
	}
	next, err := nextOccurrence(now, sc.Frequency, sc.Time, sc.Weekday)
	if err != nil {
		stdlog.Printf("backup: recompute next run: %v", err)
		return
	}
	s.nextLocal = next
	sc.NextRunAt = &next
	if err := s.saveScheduleLocked(sc); err != nil {
		stdlog.Printf("backup: persist next run: %v", err)
	}
}

// recordRunResult merges one run's outcome into the persisted schedule.
func (s *Service) recordRunResult(now time.Time, summary string) error {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	sc, err := s.loadScheduleLocked()
	if err != nil {
		return err
	}
	at := now
	sc.LastRunAt = &at
	sc.LastError = summary
	return s.saveScheduleLocked(sc)
}

// startScheduledRun admits the task set of one run: a site backup per site
// and, when includeDatabases is set, a database backup per non-system
// database. It returns the number of started tasks and a summary of admission
// failures ("" when all good).
func (s *Service) startScheduledRun(ctx context.Context, sc Schedule) (int, string) {
	if err := s.validateUploads(sc.Uploads); err != nil {
		// Every task would fail at admission; report once instead of N times.
		return 0, "uploads: " + err.Error()
	}

	hook := func(target backupTarget) func(archiveID string) {
		return func(archiveID string) {
			if err := s.recordScheduledArchive(target.kind, target.source, sc.Keep, archiveID); err != nil {
				stdlog.Printf("backup: prune scheduled archives of %s %q: %v", target.kind, target.source, err)
			}
		}
	}

	started := 0
	var failures []string
	for _, site := range s.sites.List() {
		target := backupTarget{kind: KindSite, source: site.Domain, webroot: site.Root}
		if _, err := s.startTask(target, sc.Uploads, hook(target)); err != nil {
			failures = append(failures, fmt.Sprintf("site %s: %v", site.Domain, err))
			continue
		}
		started++
	}

	if sc.IncludeDatabases {
		names, err := s.scheduledDatabases(ctx)
		if err != nil {
			failures = append(failures, "databases: "+err.Error())
		}
		for _, name := range names {
			if _, err := mysql.ValidateDatabase(name); err != nil {
				// Such a name can never become an addressable archive id;
				// starting it would only create an orphan file.
				failures = append(failures, fmt.Sprintf("database %q: %v", name, err))
				continue
			}
			target := backupTarget{kind: KindDatabase, source: name, database: name}
			if _, err := s.startTask(target, sc.Uploads, hook(target)); err != nil {
				failures = append(failures, fmt.Sprintf("database %s: %v", name, err))
				continue
			}
			started++
		}
	}
	return started, summariseFailures(failures)
}

// scheduledDatabases lists the server's non-system databases through the
// mysql client, using the invocation pattern of the rest of this package.
func (s *Service) scheduledDatabases(ctx context.Context) ([]string, error) {
	out, err := s.mysqlQuery(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(strings.TrimRight(line, "\r"))
		if name == "" || mysql.IsSystemSchema(name) {
			continue
		}
		names = append(names, name)
	}
	return names, nil
}

// summariseFailures joins admission failures for lastError, capped so a
// pathological server cannot grow the state file without bound.
func summariseFailures(failures []string) string {
	const maxRunes = 2000
	summary := strings.Join(failures, "; ")
	if runes := []rune(summary); len(runes) > maxRunes {
		return string(runes[:maxRunes]) + "..."
	}
	return summary
}

// validateSchedule enforces the frozen field rules of docs/api.md section 1.8.
func validateSchedule(sc Schedule) error {
	switch sc.Frequency {
	case "daily", "weekly":
	default:
		return apierr.BadRequest("invalid_schedule", fmt.Sprintf("frequency %q must be \"daily\" or \"weekly\"", sc.Frequency))
	}
	if !scheduleTimeRe.MatchString(sc.Time) {
		return apierr.BadRequest("invalid_schedule", fmt.Sprintf("time %q must be \"HH:MM\" between 00:00 and 23:59", sc.Time))
	}
	if sc.Weekday < 0 || sc.Weekday > 6 {
		return apierr.BadRequest("invalid_schedule", fmt.Sprintf("weekday %d must be between 0 (Sunday) and 6 (Saturday)", sc.Weekday))
	}
	if sc.Keep < 1 || sc.Keep > 365 {
		return apierr.BadRequest("invalid_schedule", fmt.Sprintf("keep %d must be between 1 and 365", sc.Keep))
	}
	return nil
}

// scheduleParams is the audited shape of a schedule change.
func scheduleParams(sc Schedule) map[string]any {
	params := map[string]any{
		"enabled":          sc.Enabled,
		"frequency":        sc.Frequency,
		"time":             sc.Time,
		"weekday":          sc.Weekday,
		"keep":             sc.Keep,
		"includeDatabases": sc.IncludeDatabases,
	}
	if len(sc.Uploads) > 0 {
		params["uploads"] = sc.Uploads
	}
	return params
}

// nextOccurrence returns the first moment strictly after now that matches the
// schedule, in the server's local time zone. weekday is 0=Sunday..6=Saturday
// and only used for weekly schedules; a daily time that already passed rolls
// over to tomorrow.
func nextOccurrence(now time.Time, frequency, hhmm string, weekday int) (time.Time, error) {
	if !scheduleTimeRe.MatchString(hhmm) {
		return time.Time{}, fmt.Errorf("time %q must be \"HH:MM\" between 00:00 and 23:59", hhmm)
	}
	hour, _ := strconv.Atoi(hhmm[:2])
	minute, _ := strconv.Atoi(hhmm[3:])
	now = now.In(time.Local)
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, time.Local)
	switch frequency {
	case "daily":
		if !next.After(now) {
			next = next.AddDate(0, 0, 1)
		}
	case "weekly":
		next = next.AddDate(0, 0, (weekday-int(now.Weekday())+7)%7)
		if !next.After(now) {
			next = next.AddDate(0, 0, 7)
		}
	default:
		return time.Time{}, fmt.Errorf("frequency %q must be \"daily\" or \"weekly\"", frequency)
	}
	return next, nil
}

// schedulePath is the persisted schedule file in AGENT_STATE_DIR.
func (s *Service) schedulePath() string { return filepath.Join(s.cfg.StateDir, scheduleFileName) }

// loadScheduleLocked reads the persisted schedule; callers hold stateMu. A
// missing file yields the documented defaults, and missing fields fall back
// to them too.
func (s *Service) loadScheduleLocked() (Schedule, error) {
	data, err := os.ReadFile(s.schedulePath())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return defaultSchedule(), nil
		}
		return Schedule{}, apierr.Internal(fmt.Sprintf("read backup schedule: %v", err))
	}
	sc := defaultSchedule()
	if err := json.Unmarshal(data, &sc); err != nil {
		return Schedule{}, apierr.Internal(fmt.Sprintf("parse backup schedule: %v", err))
	}
	return sc, nil
}

// saveScheduleLocked persists the schedule atomically; callers hold stateMu.
func (s *Service) saveScheduleLocked(sc Schedule) error {
	if err := os.MkdirAll(s.cfg.StateDir, 0o755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}
	if err := writeJSONAtomic(s.schedulePath(), sc, 0o600); err != nil {
		return fmt.Errorf("write backup schedule: %w", err)
	}
	return nil
}

// writeJSONAtomic marshals v as indented JSON and renames it into place, so a
// crash never leaves a half-written state file behind.
func writeJSONAtomic(path string, v any, perm os.FileMode) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", filepath.Base(path), err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
