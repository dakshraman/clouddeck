package cron

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func setupTestService(t *testing.T) (*Service, string, func()) {
	t.Helper()
	dir := t.TempDir()

	cfg := config.Config{
		StateDir: filepath.Join(dir, "state"),
		CronDir:  filepath.Join(dir, "cron.d"),
	}
	if err := os.MkdirAll(cfg.StateDir, 0o755); err != nil {
		t.Fatalf("mkdir state: %v", err)
	}
	if err := os.MkdirAll(cfg.CronDir, 0o755); err != nil {
		t.Fatalf("mkdir cron.d: %v", err)
	}

	auditLog, err := audit.Open(cfg.StateDir)
	if err != nil {
		t.Fatalf("open audit: %v", err)
	}

	svc := New(cfg, auditLog)
	cleanup := func() {}
	return svc, dir, cleanup
}

func TestCronAddAndList(t *testing.T) {
	svc, dir, _ := setupTestService(t)

	enabled := true
	job, err := svc.Add(AddJobRequest{
		Preset:  PresetDaily,
		Command: "echo 'hello world'",
		Title:   "Daily Greeting",
		Enabled: &enabled,
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	if job.ID == "" {
		t.Errorf("expected non-empty ID")
	}
	if job.Schedule != "0 0 * * *" {
		t.Errorf("expected schedule 0 0 * * *, got %q", job.Schedule)
	}
	if job.Minute != "0" || job.Hour != "0" || job.Day != "*" || job.Month != "*" || job.Weekday != "*" {
		t.Errorf("unexpected schedule fields: min=%s hr=%s", job.Minute, job.Hour)
	}
	if job.Preset != PresetDaily {
		t.Errorf("expected preset daily, got %s", job.Preset)
	}

	jobs := svc.List()
	if len(jobs) != 1 {
		t.Fatalf("expected 1 job, got %d", len(jobs))
	}
	if jobs[0].ID != job.ID {
		t.Errorf("expected job ID %s, got %s", job.ID, jobs[0].ID)
	}

	// Verify fragment file
	fragPath := filepath.Join(dir, "cron.d", "clouddeck-cron")
	fragContent, err := os.ReadFile(fragPath)
	if err != nil {
		t.Fatalf("read fragment failed: %v", err)
	}
	if !strings.Contains(string(fragContent), "0 0 * * * root echo 'hello world'") {
		t.Errorf("fragment does not contain active job: %s", string(fragContent))
	}
}

func TestCronUpdateAndToggle(t *testing.T) {
	svc, dir, _ := setupTestService(t)

	job, err := svc.Add(AddJobRequest{
		Schedule: "*/5 * * * *",
		Command:  "/usr/bin/php /test.php",
		Title:    "PHP Script",
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	// Toggle disabled
	disabled := false
	updated, err := svc.Update(job.ID, UpdateJobRequest{
		Enabled: &disabled,
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Enabled {
		t.Errorf("expected job to be disabled")
	}

	// Check fragment comments out disabled jobs
	fragPath := filepath.Join(dir, "cron.d", "clouddeck-cron")
	fragContent, err := os.ReadFile(fragPath)
	if err != nil {
		t.Fatalf("read fragment failed: %v", err)
	}
	if !strings.Contains(string(fragContent), "# DISABLED: */5 * * * * root /usr/bin/php /test.php") {
		t.Errorf("fragment does not show disabled job: %s", string(fragContent))
	}

	// Update command and title
	newCmd := "/usr/bin/php /test2.php"
	newTitle := "PHP Script 2"
	updated2, err := svc.Update(job.ID, UpdateJobRequest{
		Command: &newCmd,
		Title:   &newTitle,
	})
	if err != nil {
		t.Fatalf("Update command failed: %v", err)
	}
	if updated2.Command != newCmd || updated2.Title != newTitle {
		t.Errorf("unexpected updated values: cmd=%s title=%s", updated2.Command, updated2.Title)
	}
}

func TestCronDelete(t *testing.T) {
	svc, dir, _ := setupTestService(t)

	job, err := svc.Add(AddJobRequest{
		Preset:  PresetHourly,
		Command: "date",
		Title:   "Hourly Date",
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	if err := svc.Delete(job.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	jobs := svc.List()
	if len(jobs) != 0 {
		t.Fatalf("expected 0 jobs, got %d", len(jobs))
	}

	fragPath := filepath.Join(dir, "cron.d", "clouddeck-cron")
	fragContent, err := os.ReadFile(fragPath)
	if err != nil {
		t.Fatalf("read fragment failed: %v", err)
	}
	if strings.Contains(string(fragContent), "date") {
		t.Errorf("deleted job command still present in fragment")
	}
}

func TestCronRunAndHistory(t *testing.T) {
	svc, _, _ := setupTestService(t)

	job, err := svc.Add(AddJobRequest{
		Schedule: "* * * * *",
		Command:  "echo 'running test output'",
		Title:    "Output Test",
	})
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	res, err := svc.Run(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if !res.Success {
		t.Errorf("expected success")
	}
	if res.ExitCode != 0 {
		t.Errorf("expected exit code 0, got %d", res.ExitCode)
	}
	if !strings.Contains(res.Output, "running test output") {
		t.Errorf("output does not contain test text: %q", res.Output)
	}

	history := svc.GetHistory(job.ID, 10)
	if len(history) != 1 {
		t.Fatalf("expected 1 history record, got %d", len(history))
	}
	if history[0].JobID != job.ID {
		t.Errorf("expected job id %s, got %s", job.ID, history[0].JobID)
	}

	// Verify job's last_run fields
	jobAfter, err := svc.Get(job.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if jobAfter.LastRun == nil {
		t.Errorf("expected LastRun to be set")
	}
	if jobAfter.LastStatus != "success" {
		t.Errorf("expected LastStatus 'success', got %s", jobAfter.LastStatus)
	}
}

func TestCronValidation(t *testing.T) {
	svc, _, _ := setupTestService(t)

	// Missing command
	_, err := svc.Add(AddJobRequest{Schedule: "* * * * *", Command: ""})
	if err == nil {
		t.Errorf("expected error for empty command")
	}

	// Invalid schedule
	_, err = svc.Add(AddJobRequest{Schedule: "* * *", Command: "echo hi"})
	if err == nil {
		t.Errorf("expected error for invalid schedule (3 fields)")
	}

	// Invalid user
	_, err = svc.Add(AddJobRequest{Schedule: "* * * * *", Command: "echo hi", User: "bad;user"})
	if err == nil {
		t.Errorf("expected error for bad user")
	}
}
