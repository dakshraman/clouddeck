// Package cron provides system and user cron task management for CloudDeck.
// Scheduled tasks are persisted in state and written to /etc/cron.d/clouddeck-cron
// (or the configured CronDir), with full audit logging and manual execution support.
package cron

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

// Audit actions.
const (
	ActionCronAdd    = "cron.add"
	ActionCronUpdate = "cron.update"
	ActionCronDelete = "cron.delete"
	ActionCronToggle = "cron.toggle"
	ActionCronRun    = "cron.run"
)

// Preset IDs.
const (
	PresetEveryMinute  = "every_minute"
	PresetEvery5Min    = "every_5_minutes"
	PresetEvery15Min   = "every_15_minutes"
	PresetEvery30Min   = "every_30_minutes"
	PresetHourly       = "hourly"
	PresetDaily        = "daily"
	PresetWeekly       = "weekly"
	PresetMonthly      = "monthly"
	PresetCustom       = "custom"
)

// Preset represents a named schedule configuration.
type Preset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Schedule    string `json:"schedule"`
	Description string `json:"description"`
}

// AvailablePresets returns standard cron schedule presets.
var AvailablePresets = []Preset{
	{ID: PresetEveryMinute, Name: "Every Minute", Schedule: "* * * * *", Description: "Execute every minute (* * * * *)"},
	{ID: PresetEvery5Min, Name: "Every 5 Minutes", Schedule: "*/5 * * * *", Description: "Execute every 5 minutes (*/5 * * * *)"},
	{ID: PresetEvery15Min, Name: "Every 15 Minutes", Schedule: "*/15 * * * *", Description: "Execute every 15 minutes (*/15 * * * *)"},
	{ID: PresetEvery30Min, Name: "Every 30 Minutes", Schedule: "*/30 * * * *", Description: "Execute every 30 minutes (*/30 * * * *)"},
	{ID: PresetHourly, Name: "Hourly", Schedule: "0 * * * *", Description: "Execute hourly at minute 0 (0 * * * *)"},
	{ID: PresetDaily, Name: "Daily at Midnight", Schedule: "0 0 * * *", Description: "Execute daily at 00:00 (0 0 * * *)"},
	{ID: PresetWeekly, Name: "Weekly", Schedule: "0 0 * * 0", Description: "Execute weekly on Sunday at 00:00 (0 0 * * 0)"},
	{ID: PresetMonthly, Name: "Monthly", Schedule: "0 0 1 * *", Description: "Execute monthly on 1st at 00:00 (0 0 1 * *)"},
	{ID: PresetCustom, Name: "Custom", Schedule: "", Description: "Custom 5-field cron expression"},
}

// Job is a scheduled task managed by CloudDeck.
type Job struct {
	ID             string     `json:"id"`
	Schedule       string     `json:"schedule"`
	Minute         string     `json:"minute"`
	Hour           string     `json:"hour"`
	Day            string     `json:"day"`
	Month          string     `json:"month"`
	Weekday        string     `json:"weekday"`
	Command        string     `json:"command"`
	Comment        string     `json:"comment,omitempty"`
	Title          string     `json:"title,omitempty"`
	User           string     `json:"user"`
	Enabled        bool       `json:"enabled"`
	Preset         string     `json:"preset,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	LastRun        *time.Time `json:"last_run,omitempty"`
	LastStatus     string     `json:"last_status,omitempty"`
	LastOutput     string     `json:"last_output,omitempty"`
	LastDurationMs int64      `json:"last_duration_ms,omitempty"`
	LastExitCode   int        `json:"last_exit_code,omitempty"`
}

// ExecutionRecord stores one execution history item.
type ExecutionRecord struct {
	ID         string    `json:"id"`
	JobID      string    `json:"job_id"`
	JobTitle   string    `json:"job_title,omitempty"`
	Command    string    `json:"command"`
	User       string    `json:"user"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	DurationMs int64     `json:"duration_ms"`
	ExitCode   int       `json:"exit_code"`
	Output     string    `json:"output"`
	Success    bool      `json:"success"`
}

// RunResult represents the immediate output of running a task.
type RunResult struct {
	ID         string    `json:"id"`
	JobID      string    `json:"job_id"`
	Command    string    `json:"command"`
	ExitCode   int       `json:"exit_code"`
	Output     string    `json:"output"`
	DurationMs int64     `json:"duration_ms"`
	Success    bool      `json:"success"`
	RanAt      time.Time `json:"ran_at"`
}

// AddJobRequest contains fields to create a job.
type AddJobRequest struct {
	Schedule string `json:"schedule"`
	Preset   string `json:"preset,omitempty"`
	Minute   string `json:"minute,omitempty"`
	Hour     string `json:"hour,omitempty"`
	Day      string `json:"day,omitempty"`
	Month    string `json:"month,omitempty"`
	Weekday  string `json:"weekday,omitempty"`
	Command  string `json:"command"`
	Comment  string `json:"comment,omitempty"`
	Title    string `json:"title,omitempty"`
	User     string `json:"user,omitempty"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

// UpdateJobRequest contains fields to update a job.
type UpdateJobRequest struct {
	Schedule *string `json:"schedule,omitempty"`
	Preset   *string `json:"preset,omitempty"`
	Minute   *string `json:"minute,omitempty"`
	Hour     *string `json:"hour,omitempty"`
	Day      *string `json:"day,omitempty"`
	Month    *string `json:"month,omitempty"`
	Weekday  *string `json:"weekday,omitempty"`
	Command  *string `json:"command,omitempty"`
	Comment  *string `json:"comment,omitempty"`
	Title    *string `json:"title,omitempty"`
	User     *string `json:"user,omitempty"`
	Enabled  *bool   `json:"enabled,omitempty"`
}

// Service manages system cron tasks.
type Service struct {
	mu          sync.RWMutex
	cfg         config.Config
	auditLog    *audit.Log
	cronFile    string
	stateFile   string
	historyFile string
	jobs        map[string]Job
	history     []ExecutionRecord
}

const maxHistoryRecords = 100

// New creates a new cron service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	cronDir := cfg.CronDir
	if cronDir == "" {
		cronDir = "/etc/cron.d"
	}

	cronFile := filepath.Join(cronDir, "clouddeck-cron")
	stateFile := filepath.Join(cfg.StateDir, "cron.json")
	historyFile := filepath.Join(cfg.StateDir, "cron_history.json")

	s := &Service{
		cfg:         cfg,
		auditLog:    auditLog,
		cronFile:    cronFile,
		stateFile:   stateFile,
		historyFile: historyFile,
		jobs:        make(map[string]Job),
		history:     make([]ExecutionRecord, 0),
	}

	s.loadState()
	s.loadHistory()
	return s
}

// List returns all scheduled cron jobs ordered by creation time.
func (s *Service) List() []Job {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]Job, 0, len(s.jobs))
	for _, job := range s.jobs {
		out = append(out, job)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

// Get finds a single cron job by id.
func (s *Service) Get(id string) (Job, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	job, ok := s.jobs[id]
	if !ok {
		return Job{}, apierr.NotFound("cron_not_found", fmt.Sprintf("cron job %q not found", id))
	}
	return job, nil
}

// Add creates a new scheduled task.
func (s *Service) Add(req AddJobRequest) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Resolve schedule from preset or components
	schedule, minute, hour, day, month, weekday, preset, err := resolveSchedule(req.Schedule, req.Preset, req.Minute, req.Hour, req.Day, req.Month, req.Weekday)
	if err != nil {
		s.auditRecord(ActionCronAdd, map[string]any{"command": req.Command}, err)
		return Job{}, apierr.BadRequest("invalid_schedule", err.Error())
	}

	cmd := strings.TrimSpace(req.Command)
	if cmd == "" {
		err := errors.New("command is required")
		s.auditRecord(ActionCronAdd, map[string]any{"command": req.Command}, err)
		return Job{}, apierr.BadRequest("invalid_command", err.Error())
	}
	if strings.ContainsAny(cmd, "\r\n\x00") {
		err := errors.New("command cannot contain newline or null characters")
		s.auditRecord(ActionCronAdd, map[string]any{"command": req.Command}, err)
		return Job{}, apierr.BadRequest("invalid_command", err.Error())
	}

	// Resolve user
	user := strings.TrimSpace(req.User)
	if user == "" {
		user = "root"
	}
	if err := validateUser(user); err != nil {
		s.auditRecord(ActionCronAdd, map[string]any{"command": req.Command, "user": user}, err)
		return Job{}, apierr.BadRequest("invalid_user", err.Error())
	}

	title := strings.TrimSpace(req.Title)
	comment := strings.TrimSpace(req.Comment)
	if title == "" && comment != "" {
		title = comment
	} else if comment == "" && title != "" {
		comment = title
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	id := generateID()
	now := store.Now()

	job := Job{
		ID:        id,
		Schedule:  schedule,
		Minute:    minute,
		Hour:      hour,
		Day:       day,
		Month:     month,
		Weekday:   weekday,
		Command:   cmd,
		Comment:   comment,
		Title:     title,
		User:      user,
		Enabled:   enabled,
		Preset:    preset,
		CreatedAt: now,
		UpdatedAt: now,
	}

	s.jobs[id] = job
	if err := s.saveStateLocked(); err != nil {
		delete(s.jobs, id)
		s.auditRecord(ActionCronAdd, map[string]any{"id": id, "command": cmd}, err)
		return Job{}, apierr.Internal(fmt.Sprintf("save state: %v", err))
	}

	if err := s.writeCronFragmentLocked(); err != nil {
		// Log warning but state is saved
		_ = err
	}

	s.auditRecord(ActionCronAdd, map[string]any{
		"id":       id,
		"title":    title,
		"schedule": schedule,
		"command":  cmd,
		"user":     user,
		"enabled":  enabled,
	}, nil)

	return job, nil
}

// Update modifies an existing cron job or toggles its enabled status.
func (s *Service) Update(id string, req UpdateJobRequest) (Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	job, ok := s.jobs[id]
	if !ok {
		return Job{}, apierr.NotFound("cron_not_found", fmt.Sprintf("cron job %q not found", id))
	}

	action := ActionCronUpdate
	if req.Enabled != nil && req.Command == nil && req.Schedule == nil && req.Minute == nil {
		action = ActionCronToggle
	}

	// Update schedule if provided
	if req.Schedule != nil || req.Preset != nil || req.Minute != nil || req.Hour != nil {
		schedVal := job.Schedule
		if req.Schedule != nil {
			schedVal = *req.Schedule
		}
		presetVal := job.Preset
		if req.Preset != nil {
			presetVal = *req.Preset
		}
		minVal := job.Minute
		if req.Minute != nil {
			minVal = *req.Minute
		}
		hourVal := job.Hour
		if req.Hour != nil {
			hourVal = *req.Hour
		}
		dayVal := job.Day
		if req.Day != nil {
			dayVal = *req.Day
		}
		monthVal := job.Month
		if req.Month != nil {
			monthVal = *req.Month
		}
		weekdayVal := job.Weekday
		if req.Weekday != nil {
			weekdayVal = *req.Weekday
		}

		sVal, m, h, d, mo, w, p, err := resolveSchedule(schedVal, presetVal, minVal, hourVal, dayVal, monthVal, weekdayVal)
		if err != nil {
			s.auditRecord(action, map[string]any{"id": id}, err)
			return Job{}, apierr.BadRequest("invalid_schedule", err.Error())
		}
		job.Schedule = sVal
		job.Minute = m
		job.Hour = h
		job.Day = d
		job.Month = mo
		job.Weekday = w
		job.Preset = p
	}

	if req.Command != nil {
		cmd := strings.TrimSpace(*req.Command)
		if cmd == "" {
			err := errors.New("command cannot be empty")
			s.auditRecord(action, map[string]any{"id": id}, err)
			return Job{}, apierr.BadRequest("invalid_command", err.Error())
		}
		if strings.ContainsAny(cmd, "\r\n\x00") {
			err := errors.New("command cannot contain newline or null characters")
			s.auditRecord(action, map[string]any{"id": id}, err)
			return Job{}, apierr.BadRequest("invalid_command", err.Error())
		}
		job.Command = cmd
	}

	if req.User != nil {
		user := strings.TrimSpace(*req.User)
		if user == "" {
			user = "root"
		}
		if err := validateUser(user); err != nil {
			s.auditRecord(action, map[string]any{"id": id, "user": user}, err)
			return Job{}, apierr.BadRequest("invalid_user", err.Error())
		}
		job.User = user
	}

	if req.Title != nil {
		job.Title = strings.TrimSpace(*req.Title)
		if job.Comment == "" {
			job.Comment = job.Title
		}
	}
	if req.Comment != nil {
		job.Comment = strings.TrimSpace(*req.Comment)
		if job.Title == "" {
			job.Title = job.Comment
		}
	}

	if req.Enabled != nil {
		job.Enabled = *req.Enabled
	}

	job.UpdatedAt = store.Now()
	s.jobs[id] = job

	if err := s.saveStateLocked(); err != nil {
		s.auditRecord(action, map[string]any{"id": id}, err)
		return Job{}, apierr.Internal(fmt.Sprintf("save state: %v", err))
	}

	if err := s.writeCronFragmentLocked(); err != nil {
		_ = err
	}

	s.auditRecord(action, map[string]any{
		"id":      id,
		"enabled": job.Enabled,
		"command": job.Command,
	}, nil)

	return job, nil
}

// Delete removes a scheduled task.
func (s *Service) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	job, ok := s.jobs[id]
	if !ok {
		return apierr.NotFound("cron_not_found", fmt.Sprintf("cron job %q not found", id))
	}

	delete(s.jobs, id)
	if err := s.saveStateLocked(); err != nil {
		// Restore in-memory if save fails
		s.jobs[id] = job
		s.auditRecord(ActionCronDelete, map[string]any{"id": id}, err)
		return apierr.Internal(fmt.Sprintf("save state: %v", err))
	}

	if err := s.writeCronFragmentLocked(); err != nil {
		_ = err
	}

	s.auditRecord(ActionCronDelete, map[string]any{
		"id":      id,
		"command": job.Command,
	}, nil)

	return nil
}

// Run executes a cron job immediately and updates its last run info.
func (s *Service) Run(ctx context.Context, id string) (RunResult, error) {
	s.mu.RLock()
	job, ok := s.jobs[id]
	s.mu.RUnlock()

	if !ok {
		return RunResult{}, apierr.NotFound("cron_not_found", fmt.Sprintf("cron job %q not found", id))
	}

	timeout := 120 * time.Second
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	shell := "/bin/bash"
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}

	startTime := time.Now()
	cmd := exec.CommandContext(execCtx, shell, "-c", job.Command)

	// User switching if non-root and running as root
	if job.User != "" && job.User != "root" && os.Geteuid() == 0 {
		u, err := user.Lookup(job.User)
		if err == nil {
			if uid, err := strconv.Atoi(u.Uid); err == nil {
				if gid, err := strconv.Atoi(u.Gid); err == nil {
					cmd.SysProcAttr = &syscall.SysProcAttr{
						Credential: &syscall.Credential{
							Uid: uint32(uid),
							Gid: uint32(gid),
						},
					}
				}
			}
		}
	}

	outBytes, runErr := cmd.CombinedOutput()
	duration := time.Since(startTime)
	durationMs := duration.Milliseconds()
	finishTime := time.Now()

	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	output := string(outBytes)
	if len(output) > 65536 {
		output = output[:65536] + "\n...[truncated]"
	}

	success := (exitCode == 0)
	statusStr := "success"
	if !success {
		statusStr = "failed"
	}

	runID := generateID()
	record := ExecutionRecord{
		ID:         runID,
		JobID:      job.ID,
		JobTitle:   job.Title,
		Command:    job.Command,
		User:       job.User,
		StartedAt:  startTime.UTC().Truncate(time.Second),
		FinishedAt: finishTime.UTC().Truncate(time.Second),
		DurationMs: durationMs,
		ExitCode:   exitCode,
		Output:     output,
		Success:    success,
	}

	// Update job state and history under lock
	s.mu.Lock()
	if curr, exists := s.jobs[id]; exists {
		curr.LastRun = &record.StartedAt
		curr.LastStatus = statusStr
		curr.LastOutput = output
		curr.LastDurationMs = durationMs
		curr.LastExitCode = exitCode
		curr.UpdatedAt = store.Now()
		s.jobs[id] = curr
		_ = s.saveStateLocked()
	}

	// Append to history (keep maxHistoryRecords)
	s.history = append([]ExecutionRecord{record}, s.history...)
	if len(s.history) > maxHistoryRecords {
		s.history = s.history[:maxHistoryRecords]
	}
	_ = s.saveHistoryLocked()
	s.mu.Unlock()

	s.auditRecord(ActionCronRun, map[string]any{
		"id":        id,
		"command":   job.Command,
		"exit_code": exitCode,
		"success":   success,
	}, nil)

	return RunResult{
		ID:         runID,
		JobID:      job.ID,
		Command:    job.Command,
		ExitCode:   exitCode,
		Output:     output,
		DurationMs: durationMs,
		Success:    success,
		RanAt:      record.StartedAt,
	}, nil
}

// GetHistory returns recent execution history.
func (s *Service) GetHistory(jobID string, limit int) []ExecutionRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > maxHistoryRecords {
		limit = 50
	}

	out := make([]ExecutionRecord, 0, limit)
	for _, rec := range s.history {
		if jobID == "" || rec.JobID == jobID {
			out = append(out, rec)
			if len(out) >= limit {
				break
			}
		}
	}
	return out
}

// writeCronFragmentLocked writes the /etc/cron.d/clouddeck-cron file atomically.
func (s *Service) writeCronFragmentLocked() error {
	dir := filepath.Dir(s.cronFile)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create cron dir %s: %w", dir, err)
	}

	var b strings.Builder
	b.WriteString("# managed-by: clouddeck\n")
	b.WriteString("# DO NOT EDIT DIRECTLY. This file is automatically managed by CloudDeck.\n")
	b.WriteString("SHELL=/bin/bash\n")
	b.WriteString("PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n")

	// Order jobs consistently
	jobs := make([]Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobs = append(jobs, j)
	}
	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].ID < jobs[j].ID
	})

	for _, j := range jobs {
		title := j.Title
		if title == "" {
			title = j.Comment
		}
		if title != "" {
			fmt.Fprintf(&b, "# ID: %s | Title: %s\n", j.ID, title)
		} else {
			fmt.Fprintf(&b, "# ID: %s\n", j.ID)
		}

		user := j.User
		if user == "" {
			user = "root"
		}

		if j.Enabled {
			fmt.Fprintf(&b, "%s %s %s\n\n", j.Schedule, user, j.Command)
		} else {
			fmt.Fprintf(&b, "# DISABLED: %s %s %s\n\n", j.Schedule, user, j.Command)
		}
	}

	return writeFileAtomic(s.cronFile, []byte(b.String()), 0o644)
}

// writeFileAtomic writes path atomically using temporary file and rename.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
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
	return os.Rename(tmpName, path)
}

// loadState loads jobs from JSON state.
func (s *Service) loadState() {
	data, err := os.ReadFile(s.stateFile)
	if err != nil {
		return
	}
	var loaded []Job
	if err := json.Unmarshal(data, &loaded); err != nil {
		return
	}
	for _, j := range loaded {
		s.jobs[j.ID] = j
	}
}

// saveStateLocked writes current jobs to state file.
func (s *Service) saveStateLocked() error {
	jobs := make([]Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		jobs = append(jobs, j)
	}
	sort.Slice(jobs, func(i, j int) bool {
		return jobs[i].CreatedAt.Before(jobs[j].CreatedAt)
	})

	data, err := json.MarshalIndent(jobs, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.stateFile), 0o755); err != nil {
		return err
	}
	return writeFileAtomic(s.stateFile, data, 0o600)
}

// loadHistory loads execution records from history file.
func (s *Service) loadHistory() {
	data, err := os.ReadFile(s.historyFile)
	if err != nil {
		return
	}
	var loaded []ExecutionRecord
	if err := json.Unmarshal(data, &loaded); err != nil {
		return
	}
	s.history = loaded
}

// saveHistoryLocked writes history records to file.
func (s *Service) saveHistoryLocked() error {
	data, err := json.MarshalIndent(s.history, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.historyFile), 0o755); err != nil {
		return err
	}
	return writeFileAtomic(s.historyFile, data, 0o600)
}

// auditRecord logs to the agent audit log and also /var/lib/clouddeck/audit.jsonl.
func (s *Service) auditRecord(action string, params map[string]any, err error) {
	result := audit.ResultAccepted
	errStr := ""
	if err != nil {
		result = audit.ResultRejected
		errStr = err.Error()
	}

	rec := audit.Record{
		TS:     time.Now().UTC().Truncate(time.Second),
		Action: action,
		Params: params,
		Result: result,
		Error:  errStr,
	}

	if s.auditLog != nil {
		_ = s.auditLog.Append(rec)
	}

	// Append to /var/lib/clouddeck/audit.jsonl and stateDir/audit.jsonl
	lineBytes, jsonErr := json.Marshal(rec)
	if jsonErr != nil {
		return
	}
	lineBytes = append(lineBytes, '\n')

	paths := []string{
		"/var/lib/clouddeck/audit.jsonl",
		filepath.Join(s.cfg.StateDir, "audit.jsonl"),
	}

	for _, p := range paths {
		dir := filepath.Dir(p)
		if mkErr := os.MkdirAll(dir, 0o755); mkErr == nil {
			f, opErr := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
			if opErr == nil {
				_, _ = f.Write(lineBytes)
				f.Close()
			}
		}
	}
}

// Helper schedule resolver and validator.
var validFieldRe = regexp.MustCompile(`^[0-9*,\-/]+$`)
var userRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,32}$`)

func validateUser(u string) error {
	if !userRe.MatchString(u) {
		return fmt.Errorf("invalid user %q", u)
	}
	return nil
}

func generateID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "cron_" + hex.EncodeToString(b)
}

func resolveSchedule(schedule, preset, minute, hour, day, month, weekday string) (sched, min, hr, d, mo, wd, pr string, err error) {
	// Check preset first
	if preset != "" && preset != PresetCustom {
		for _, p := range AvailablePresets {
			if strings.EqualFold(p.ID, preset) || strings.EqualFold(p.Name, preset) {
				fields := strings.Fields(p.Schedule)
				if len(fields) == 5 {
					return p.Schedule, fields[0], fields[1], fields[2], fields[3], fields[4], p.ID, nil
				}
			}
		}
	}

	// If schedule is given
	schedule = strings.TrimSpace(schedule)
	if schedule != "" {
		fields := strings.Fields(schedule)
		if len(fields) != 5 {
			return "", "", "", "", "", "", "", fmt.Errorf("cron schedule must have exactly 5 fields, got %d in %q", len(fields), schedule)
		}
		for i, f := range fields {
			if !validFieldRe.MatchString(f) {
				return "", "", "", "", "", "", "", fmt.Errorf("field %d (%q) contains invalid characters", i+1, f)
			}
		}
		// Match against preset if any
		pr = PresetCustom
		for _, p := range AvailablePresets {
			if p.Schedule == schedule {
				pr = p.ID
				break
			}
		}
		return schedule, fields[0], fields[1], fields[2], fields[3], fields[4], pr, nil
	}

	// Otherwise combine individual components
	m := strings.TrimSpace(minute)
	h := strings.TrimSpace(hour)
	dy := strings.TrimSpace(day)
	mn := strings.TrimSpace(month)
	w := strings.TrimSpace(weekday)

	if m == "" {
		m = "*"
	}
	if h == "" {
		h = "*"
	}
	if dy == "" {
		dy = "*"
	}
	if mn == "" {
		mn = "*"
	}
	if w == "" {
		w = "*"
	}

	sched = fmt.Sprintf("%s %s %s %s %s", m, h, dy, mn, w)
	fields := []string{m, h, dy, mn, w}
	for i, f := range fields {
		if !validFieldRe.MatchString(f) {
			return "", "", "", "", "", "", "", fmt.Errorf("field %d (%q) contains invalid characters", i+1, f)
		}
	}

	pr = PresetCustom
	for _, p := range AvailablePresets {
		if p.Schedule == sched {
			pr = p.ID
			break
		}
	}
	return sched, m, h, dy, mn, w, pr, nil
}
