package backup

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

// writeScheduleFile plants a schedule JSON file directly, as an earlier agent
// version or an operator could have.
func writeScheduleFile(t *testing.T, h *harness, sc Schedule) {
	t.Helper()
	data, err := json.Marshal(sc)
	if err != nil {
		t.Fatalf("marshal schedule: %v", err)
	}
	mustWrite(t, filepath.Join(h.stateDir, scheduleFileName), string(data))
}

// readLedger loads the pruning ledger the scheduled backups are using.
func readLedger(t *testing.T, h *harness) *scheduleLedger {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(h.stateDir, ledgerFileName))
	if err != nil {
		t.Fatalf("read ledger: %v", err)
	}
	led := newScheduleLedger()
	if err := json.Unmarshal(data, led); err != nil {
		t.Fatalf("parse ledger: %v", err)
	}
	return led
}

// wantFile asserts that path exists (want true) or does not exist (want
// false) under the harness's temp dirs.
func wantFile(t *testing.T, path string, want bool) {
	t.Helper()
	_, err := os.Lstat(path)
	switch {
	case want && err != nil:
		t.Errorf("expected %s to exist: %v", path, err)
	case !want && err == nil:
		t.Errorf("expected %s to be gone", path)
	case !want && err != nil && !errors.Is(err, fs.ErrNotExist):
		t.Errorf("stat %s: %v", path, err)
	}
}

func TestScheduleDefaults(t *testing.T) {
	h := newHarness(t, nil)

	sc, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	want := Schedule{Enabled: false, Frequency: "daily", Time: "03:00", Weekday: 0, Keep: 7}
	if sc.Enabled != want.Enabled || sc.Frequency != want.Frequency || sc.Time != want.Time ||
		sc.Weekday != want.Weekday || sc.Keep != want.Keep || sc.IncludeDatabases != want.IncludeDatabases {
		t.Errorf("GetSchedule = %+v, want the documented defaults %+v", sc, want)
	}
	if sc.LastRunAt != nil || sc.NextRunAt != nil || sc.LastError != "" || len(sc.Uploads) != 0 {
		t.Errorf("default schedule has stray state: %+v", sc)
	}
	// Reading must never create the state file.
	wantFile(t, filepath.Join(h.stateDir, scheduleFileName), false)
}

func TestScheduleDryRun(t *testing.T) {
	h := newHarness(t, func(cfg *config.Config) { cfg.DryRun = true })

	if sc, err := h.svc.GetSchedule(); err != nil || sc.Frequency != "daily" {
		t.Fatalf("GetSchedule in dry-run = %+v, %v; reads must still work", sc, err)
	}
	if _, err := h.svc.SetSchedule(Schedule{Enabled: true, Frequency: "daily", Time: "03:00", Keep: 7}); err == nil {
		t.Error("SetSchedule in dry-run = nil, want dry_run")
	} else {
		wantAPIError(t, err, 409, "dry_run")
	}
	if _, err := h.svc.RunScheduledNow(); err == nil {
		t.Error("RunScheduledNow in dry-run = nil, want dry_run")
	} else {
		wantAPIError(t, err, 409, "dry_run")
	}
	h.svc.Start() // must be a no-op and return synchronously
	if got := len(h.st.ListTasks()); got != 0 {
		t.Errorf("dry-run Start left %d tasks behind", got)
	}
	wantFile(t, filepath.Join(h.stateDir, scheduleFileName), false)
}

func TestSetScheduleValidation(t *testing.T) {
	h := newHarness(t, nil)
	baseline := func() Schedule {
		return Schedule{Enabled: true, Frequency: "daily", Time: "03:00", Weekday: 0, Keep: 7}
	}

	cases := []struct {
		name    string
		mutate  func(sc *Schedule)
		wantMsg string
	}{
		{"empty frequency", func(sc *Schedule) { sc.Frequency = "" }, "frequency"},
		{"unknown frequency", func(sc *Schedule) { sc.Frequency = "monthly" }, `"monthly"`},
		{"time 24:00", func(sc *Schedule) { sc.Time = "24:00" }, "00:00 and 23:59"},
		{"time 03:60", func(sc *Schedule) { sc.Time = "03:60" }, "HH:MM"},
		{"time not padded", func(sc *Schedule) { sc.Time = "3:00" }, "HH:MM"},
		{"time empty", func(sc *Schedule) { sc.Time = "" }, "HH:MM"},
		{"weekday negative", func(sc *Schedule) { sc.Weekday = -1 }, "weekday"},
		{"weekday too high", func(sc *Schedule) { sc.Weekday = 7 }, "weekday"},
		{"keep zero", func(sc *Schedule) { sc.Keep = 0 }, "keep"},
		{"keep too high", func(sc *Schedule) { sc.Keep = 366 }, "keep"},
		{"unknown upload", func(sc *Schedule) { sc.Uploads = []UploadTarget{{Type: "dropbox"}} }, "unsupported upload type"},
		{"malformed rclone remote", func(sc *Schedule) { sc.Uploads = []UploadTarget{{Type: "rclone", Remote: "gdrive"}} }, "rclone remote"},
		{"telegram not configured", func(sc *Schedule) { sc.Uploads = []UploadTarget{{Type: "telegram"}} }, "telegram uploads need"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sc := baseline()
			tc.mutate(&sc)
			_, err := h.svc.SetSchedule(sc)
			wantAPIError(t, err, 400, "invalid_schedule")
			if !strings.Contains(err.Error(), tc.wantMsg) {
				t.Errorf("error %q does not mention %q", err, tc.wantMsg)
			}
		})
	}
	// Nothing invalid was persisted.
	wantFile(t, filepath.Join(h.stateDir, scheduleFileName), false)

	// Valid daily schedule.
	now := time.Now()
	daily, err := h.svc.SetSchedule(Schedule{Enabled: true, Frequency: "daily", Time: "23:59", Weekday: 0, Keep: 1})
	if err != nil {
		t.Fatalf("SetSchedule(daily): %v", err)
	}
	if daily.NextRunAt == nil || !daily.NextRunAt.After(now) || daily.NextRunAt.Sub(now) > 24*time.Hour {
		t.Errorf("daily nextRunAt = %v, want strictly within the next 24h of %v", daily.NextRunAt, now)
	}
	if daily.LastRunAt != nil || daily.LastError != "" {
		t.Errorf("fresh schedule has run state: %+v", daily)
	}
	wantFile(t, filepath.Join(h.stateDir, scheduleFileName), true)

	// Valid weekly schedule with an rclone upload.
	weekly, err := h.svc.SetSchedule(Schedule{
		Enabled: true, Frequency: "weekly", Time: "00:00", Weekday: 6, Keep: 365,
		IncludeDatabases: true, Uploads: []UploadTarget{{Type: "rclone", Remote: "gdrive:backups"}},
	})
	if err != nil {
		t.Fatalf("SetSchedule(weekly): %v", err)
	}
	if weekly.NextRunAt == nil || !weekly.NextRunAt.After(time.Now()) || weekly.NextRunAt.Weekday() != time.Saturday {
		t.Errorf("weekly nextRunAt = %v, want the next Saturday", weekly.NextRunAt)
	}

	// The audit trail records accepts and rejects with the schedule action.
	auditData := mustRead(t, filepath.Join(h.stateDir, "audit.log"))
	if !strings.Contains(auditData, `"action":"backup.schedule.set"`) {
		t.Errorf("audit log misses the schedule action:\n%s", auditData)
	}
	if !strings.Contains(auditData, `"result":"accepted"`) || !strings.Contains(auditData, `"result":"rejected"`) {
		t.Errorf("audit log misses accepted/rejected schedule records:\n%s", auditData)
	}
}

func TestSetSchedulePersistsAndPreservesRunState(t *testing.T) {
	h := newHarness(t, nil)

	if _, err := h.svc.SetSchedule(Schedule{Enabled: false, Frequency: "daily", Time: "03:00", Keep: 7}); err != nil {
		t.Fatalf("first SetSchedule: %v", err)
	}
	// Simulate a previous run's outcome.
	runAt := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Second)
	if err := h.svc.recordRunResult(runAt, `site gone.example.com: site "gone.example.com" does not exist`); err != nil {
		t.Fatalf("recordRunResult: %v", err)
	}

	updated, err := h.svc.SetSchedule(Schedule{
		Enabled: true, Frequency: "weekly", Time: "04:30", Weekday: 5, Keep: 3,
		IncludeDatabases: true, Uploads: []UploadTarget{{Type: "rclone", Remote: "gdrive:backups"}},
	})
	if err != nil {
		t.Fatalf("SetSchedule: %v", err)
	}
	if updated.LastRunAt == nil || !updated.LastRunAt.Equal(runAt) {
		t.Errorf("lastRunAt = %v, want the preserved %v", updated.LastRunAt, runAt)
	}
	if !strings.Contains(updated.LastError, "gone.example.com") {
		t.Errorf("lastError = %q, want the preserved run failure", updated.LastError)
	}
	if updated.NextRunAt == nil || updated.NextRunAt.Hour() != 4 || updated.NextRunAt.Minute() != 30 || updated.NextRunAt.Weekday() != time.Friday {
		t.Errorf("nextRunAt = %v, want the next Friday 04:30", updated.NextRunAt)
	}

	// Round trip through the persisted file.
	got, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	if !got.Enabled || got.Frequency != "weekly" || got.Time != "04:30" || got.Weekday != 5 ||
		got.Keep != 3 || !got.IncludeDatabases || len(got.Uploads) != 1 ||
		got.Uploads[0].Type != "rclone" || got.Uploads[0].Remote != "gdrive:backups" {
		t.Errorf("round-tripped schedule = %+v", got)
	}
	if got.LastRunAt == nil || !got.LastRunAt.Equal(runAt) || !strings.Contains(got.LastError, "gone.example.com") {
		t.Errorf("round-tripped run state = %v / %q", got.LastRunAt, got.LastError)
	}
	if got.NextRunAt == nil || !got.NextRunAt.Equal(*updated.NextRunAt) {
		t.Errorf("round-tripped nextRunAt = %v, want %v", got.NextRunAt, updated.NextRunAt)
	}
}

func TestNextOccurrence(t *testing.T) {
	// 2026-10-17 is a Saturday.
	sat := time.Date(2026, 10, 17, 10, 0, 0, 0, time.Local)
	cases := []struct {
		name      string
		now       time.Time
		frequency string
		at        string
		weekday   int
		want      time.Time
	}{
		{
			"daily later today",
			sat, "daily", "12:30", 0,
			time.Date(2026, 10, 17, 12, 30, 0, 0, time.Local),
		},
		{
			"daily rolls over to tomorrow",
			sat, "daily", "03:00", 0,
			time.Date(2026, 10, 18, 3, 0, 0, 0, time.Local),
		},
		{
			"daily exact time is the next day (strictly after)",
			time.Date(2026, 10, 17, 3, 0, 0, 0, time.Local), "daily", "03:00", 0,
			time.Date(2026, 10, 18, 3, 0, 0, 0, time.Local),
		},
		{
			"daily just before the time fires today",
			time.Date(2026, 10, 17, 2, 59, 59, 0, time.Local), "daily", "03:00", 0,
			time.Date(2026, 10, 17, 3, 0, 0, 0, time.Local),
		},
		{
			"weekly later this week",
			sat, "weekly", "03:00", 0, // Sunday
			time.Date(2026, 10, 18, 3, 0, 0, 0, time.Local),
		},
		{
			"weekly wraps to next week for an earlier weekday",
			sat, "weekly", "03:00", 1, // Monday
			time.Date(2026, 10, 19, 3, 0, 0, 0, time.Local),
		},
		{
			"weekly same day before the time fires today",
			time.Date(2026, 10, 17, 2, 0, 0, 0, time.Local), "weekly", "03:00", 6, // Saturday
			time.Date(2026, 10, 17, 3, 0, 0, 0, time.Local),
		},
		{
			"weekly same day exact time wraps a whole week",
			time.Date(2026, 10, 17, 3, 0, 0, 0, time.Local), "weekly", "03:00", 6,
			time.Date(2026, 10, 24, 3, 0, 0, 0, time.Local),
		},
		{
			"weekly earlier day wraps to next week",
			sat, "weekly", "03:00", 3, // Wednesday
			time.Date(2026, 10, 21, 3, 0, 0, 0, time.Local),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := nextOccurrence(tc.now, tc.frequency, tc.at, tc.weekday)
			if err != nil {
				t.Fatalf("nextOccurrence: %v", err)
			}
			if !got.Equal(tc.want) {
				t.Errorf("nextOccurrence(%v, %s, %s, %d) = %v, want %v", tc.now, tc.frequency, tc.at, tc.weekday, got, tc.want)
			}
			if !got.After(tc.now) {
				t.Errorf("nextOccurrence returned %v, which is not strictly after %v", got, tc.now)
			}
		})
	}

	if _, err := nextOccurrence(sat, "daily", "24:00", 0); err == nil {
		t.Error("nextOccurrence(24:00) = nil, want an error")
	}
	if _, err := nextOccurrence(sat, "monthly", "03:00", 0); err == nil {
		t.Error("nextOccurrence(monthly) = nil, want an error")
	}
}

func TestRunScheduledNowStartsSitesAndDatabases(t *testing.T) {
	dir := t.TempDir()
	fakeMySQL := writeScript(t, dir, "mysql", "#! /bin/sh\n"+
		"case \"$*\" in\n"+
		"  *\"SHOW DATABASES\"*) echo information_schema; echo performance_schema; echo mysql; echo sys; echo shop_db ;;\n"+
		"esac\n")
	fakeDump := writeScript(t, dir, "mysqldump", "#! /bin/sh\necho 'SELECT 1;'\n")
	h := newHarness(t, func(cfg *config.Config) {
		cfg.MySQLBin = fakeMySQL
		cfg.MySQLDumpBin = fakeDump
	})

	rootA := h.addSite("example.com")
	mustWrite(t, filepath.Join(rootA, "index.html"), "hello")
	h.addSite("a.example.com")

	if _, err := h.svc.SetSchedule(Schedule{
		Enabled: true, Frequency: "daily", Time: "03:00", Weekday: 0, Keep: 2, IncludeDatabases: true,
	}); err != nil {
		t.Fatalf("SetSchedule: %v", err)
	}

	started, err := h.svc.RunScheduledNow()
	if err != nil {
		t.Fatalf("RunScheduledNow: %v", err)
	}
	if started != 3 {
		t.Errorf("RunScheduledNow started %d tasks, want 3 (two sites + one non-system database)", started)
	}

	h.eng.Wait()
	bySite := map[string]store.Task{}
	for _, task := range h.st.ListTasks() {
		if task.Type != TaskCreate {
			t.Errorf("task %s has type %q, want %q", task.ID, task.Type, TaskCreate)
		}
		if task.Status != store.TaskSucceeded {
			t.Errorf("task for %s = %s, error %v", task.Site, task.Status, task.Error)
		}
		bySite[task.Site] = task
	}
	for _, source := range []string{"example.com", "a.example.com", "shop_db"} {
		if _, ok := bySite[source]; !ok {
			t.Errorf("no backup.create task for %q (got %v)", source, bySite)
		}
	}

	// The run outcome is persisted.
	sc, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	if sc.LastRunAt == nil {
		t.Error("lastRunAt not persisted after RunScheduledNow")
	}
	if sc.LastError != "" {
		t.Errorf("lastError = %q, want empty when every task was admitted", sc.LastError)
	}
	// nextRunAt must not move: a manual run does not change the schedule.
	if sc.NextRunAt == nil {
		t.Error("nextRunAt lost after RunScheduledNow")
	}

	// Every successful scheduled archive landed in the ledger, including the
	// database, and nothing else did.
	led := readLedger(t, h)
	for _, key := range []string{"site/example.com", "site/a.example.com", "database/shop_db"} {
		if got := len(led.Sources[key]); got != 1 {
			t.Errorf("ledger[%q] has %d entries, want 1: %v", key, got, led.Sources)
		}
	}
}

func TestRunScheduledNowAdmissionFailures(t *testing.T) {
	dir := t.TempDir()
	failingMySQL := writeScript(t, dir, "mysql", "#! /bin/sh\necho 'server is down' >&2\nexit 1\n")
	h := newHarness(t, func(cfg *config.Config) { cfg.MySQLBin = failingMySQL })

	h.addSite("example.com")
	// Long enough that "site-<domain>-<unix>.zip" breaks the 200-char id
	// budget; the task can never be admitted.
	longDomain := strings.Repeat("a", 63) + "." + strings.Repeat("b", 63) + "." + strings.Repeat("c", 55)
	h.addSite(longDomain)

	if _, err := h.svc.SetSchedule(Schedule{
		Enabled: true, Frequency: "daily", Time: "03:00", Keep: 2, IncludeDatabases: true,
	}); err != nil {
		t.Fatalf("SetSchedule: %v", err)
	}

	started, err := h.svc.RunScheduledNow()
	if err != nil {
		t.Fatalf("RunScheduledNow: %v", err)
	}
	if started != 1 {
		t.Errorf("RunScheduledNow started %d tasks, want 1", started)
	}
	sc, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	if !strings.Contains(sc.LastError, "too long for an archive name") {
		t.Errorf("lastError = %q, want the long-domain admission failure", sc.LastError)
	}
	if !strings.Contains(sc.LastError, "databases:") {
		t.Errorf("lastError = %q, want the database listing failure", sc.LastError)
	}
	h.eng.Wait()
	if got := len(h.st.ListTasks()); got != 1 {
		t.Errorf("admitted %d tasks, want 1", got)
	}
}

func TestRecordScheduledArchivePrunes(t *testing.T) {
	h := newHarness(t, nil)
	backupDir := h.cfg.BackupDir

	scheduled := []string{
		"site-example.com-1001.tar.gz",
		"site-example.com-1002.tar.gz",
		"site-example.com-1003.tar.gz",
		"site-example.com-1004.tar.gz",
		"site-example.com-1005.tar.gz",
		"site-example.com-1006.tar.gz",
	}
	for _, id := range scheduled {
		mustWrite(t, filepath.Join(backupDir, id), "x")
	}
	manual := "site-example.com-0900.tar.gz"
	otherSource := "site-other.com-1005.tar.gz"
	foreignDB := "database-shop_db-1005.sql.gz"
	for _, id := range []string{manual, otherSource, foreignDB} {
		mustWrite(t, filepath.Join(backupDir, id), "x")
	}

	// Crafted ledger: shuffled order, one vanished archive (1000), one entry
	// whose kind does not belong to this source key.
	mustWrite(t, filepath.Join(h.stateDir, ledgerFileName),
		`{"sources":{"site/example.com":`+
			`["site-example.com-1002.tar.gz","site-example.com-1000.tar.gz","site-example.com-1005.tar.gz",`+
			`"site-example.com-1004.tar.gz","site-example.com-1001.tar.gz","site-example.com-1003.tar.gz",`+
			`"database-shop_db-1005.sql.gz"]}}`)

	if err := h.svc.recordScheduledArchive(KindSite, "example.com", 2, "site-example.com-1006.tar.gz"); err != nil {
		t.Fatalf("recordScheduledArchive: %v", err)
	}

	// The newest two scheduled archives survive; the older scheduled ones are
	// pruned (the already-missing 1000 is simply forgotten).
	for _, id := range []string{
		"site-example.com-1000.tar.gz", "site-example.com-1001.tar.gz",
		"site-example.com-1002.tar.gz", "site-example.com-1003.tar.gz",
		"site-example.com-1004.tar.gz",
	} {
		wantFile(t, filepath.Join(backupDir, id), false)
	}
	// Manual archives, other sources and non-matching ledger entries are
	// never pruned.
	for _, id := range []string{"site-example.com-1006.tar.gz", "site-example.com-1005.tar.gz", manual, otherSource, foreignDB} {
		wantFile(t, filepath.Join(backupDir, id), true)
	}

	led := readLedger(t, h)
	got := led.Sources["site/example.com"]
	if len(got) != 2 || got[0] != "site-example.com-1006.tar.gz" || got[1] != "site-example.com-1005.tar.gz" {
		t.Errorf("ledger[site/example.com] = %v, want the newest two", got)
	}
	if _, ok := led.Sources["database/shop_db"]; ok {
		t.Errorf("foreign ledger entry survived bookkeeping: %v", led.Sources)
	}

	// A following scheduled archive rolls the window forward.
	newest := "site-example.com-1007.tar.gz"
	mustWrite(t, filepath.Join(backupDir, newest), "x")
	if err := h.svc.recordScheduledArchive(KindSite, "example.com", 2, newest); err != nil {
		t.Fatalf("second recordScheduledArchive: %v", err)
	}
	wantFile(t, filepath.Join(backupDir, "site-example.com-1005.tar.gz"), false)
	wantFile(t, filepath.Join(backupDir, "site-example.com-1006.tar.gz"), true)
	wantFile(t, filepath.Join(backupDir, newest), true)
	got = readLedger(t, h).Sources["site/example.com"]
	if len(got) != 2 || got[0] != newest || got[1] != "site-example.com-1006.tar.gz" {
		t.Errorf("ledger[site/example.com] = %v after the second run", got)
	}
}

func TestRecordScheduledArchiveSkipsNonRegularEntries(t *testing.T) {
	h := newHarness(t, nil)
	backupDir := h.cfg.BackupDir

	// A directory named like an archive must never be removed nor pruned, and
	// it must leave the bookkeeping.
	dirName := "site-example.com-1001.tar.gz"
	if err := os.MkdirAll(filepath.Join(backupDir, dirName), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	newID := "site-example.com-1002.tar.gz"
	mustWrite(t, filepath.Join(backupDir, newID), "x")
	mustWrite(t, filepath.Join(h.stateDir, ledgerFileName),
		`{"sources":{"site/example.com":["`+dirName+`"]}}`)

	if err := h.svc.recordScheduledArchive(KindSite, "example.com", 1, newID); err != nil {
		t.Fatalf("recordScheduledArchive: %v", err)
	}
	info, err := os.Lstat(filepath.Join(backupDir, dirName))
	if err != nil || !info.IsDir() {
		t.Fatalf("directory %s was touched by pruning: %v", dirName, err)
	}
	got := readLedger(t, h).Sources["site/example.com"]
	if len(got) != 1 || got[0] != newID {
		t.Errorf("ledger = %v, want only the new regular archive", got)
	}
}

func TestTickRunsDueScheduleOnce(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")

	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.Local)
	due := now.Add(-time.Hour)
	writeScheduleFile(t, h, Schedule{
		Enabled: true, Frequency: "daily", Time: "03:00", Weekday: 0, Keep: 2, NextRunAt: &due,
	})

	// A run that is still admitting tasks makes this tick skip; nextRunAt
	// stays in the past so the next tick retries.
	h.svc.runMu.Lock()
	h.svc.tick(now)
	h.svc.runMu.Unlock()
	if got := len(h.st.ListTasks()); got != 0 {
		t.Fatalf("tick started %d tasks while a run was in flight", got)
	}
	persisted, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	if persisted.NextRunAt == nil || !persisted.NextRunAt.Equal(due) {
		t.Fatalf("skipped tick moved nextRunAt to %v", persisted.NextRunAt)
	}

	// The due tick fires exactly one task set.
	h.svc.tick(now)
	h.eng.Wait()
	tasks := h.st.ListTasks()
	if len(tasks) != 1 {
		t.Fatalf("due tick started %d tasks, want 1", len(tasks))
	}
	if tasks[0].Type != TaskCreate || tasks[0].Site != "example.com" || tasks[0].Status != store.TaskSucceeded {
		t.Errorf("task = %+v, want a succeeded backup.create for example.com", tasks[0])
	}

	persisted, err = h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	if persisted.LastRunAt == nil {
		t.Error("tick did not persist lastRunAt")
	}
	if persisted.NextRunAt == nil || !persisted.NextRunAt.After(now) {
		t.Errorf("tick nextRunAt = %v, want a strictly future occurrence", persisted.NextRunAt)
	}

	// The next tick must not duplicate the run, and the successful archive
	// must be in the ledger.
	h.svc.tick(now)
	if got := len(h.st.ListTasks()); got != 1 {
		t.Errorf("following tick started %d tasks in total, want 1", got)
	}
	led := readLedger(t, h)
	if got := led.Sources["site/example.com"]; len(got) != 1 {
		t.Errorf("ledger[site/example.com] = %v, want the scheduled archive", got)
	}
}

func TestTickRepairsMissingNextRunAt(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")

	// Enabled schedule without a next occurrence must be repaired, not fired
	// immediately.
	writeScheduleFile(t, h, Schedule{Enabled: true, Frequency: "weekly", Time: "03:00", Weekday: 1, Keep: 1})
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.Local) // Saturday
	h.svc.tick(now)
	if got := len(h.st.ListTasks()); got != 0 {
		t.Fatalf("tick fired %d tasks for a schedule without nextRunAt", got)
	}
	persisted, err := h.svc.GetSchedule()
	if err != nil {
		t.Fatalf("GetSchedule: %v", err)
	}
	want := time.Date(2026, 10, 19, 3, 0, 0, 0, time.Local) // next Monday
	if persisted.NextRunAt == nil || !persisted.NextRunAt.Equal(want) {
		t.Errorf("repaired nextRunAt = %v, want %v", persisted.NextRunAt, want)
	}

	// A disabled schedule never fires, even when due.
	enabled := false
	writeScheduleFile(t, h, Schedule{Enabled: enabled, Frequency: "daily", Time: "03:00", Keep: 1, NextRunAt: &now})
	h.svc.tick(now)
	if got := len(h.st.ListTasks()); got != 0 {
		t.Errorf("disabled schedule fired %d tasks", got)
	}
}
