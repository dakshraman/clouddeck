package siteinfo

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// harness wires the info service to real temp dirs and state, with no
// external services.
type harness struct {
	t   *testing.T
	svc *Service
	cfg config.Config
	st  *store.Store
}

func newHarness(t *testing.T, mutate func(*config.Config)) *harness {
	t.Helper()
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	st, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir: stateDir,
		Webroot:  filepath.Join(dir, "www"),
		LogDir:   filepath.Join(dir, "logs"),
		PHPBase:  filepath.Join(dir, "php"),
	}
	if mutate != nil {
		mutate(&cfg)
	}
	if err := os.MkdirAll(cfg.Webroot, 0o755); err != nil {
		t.Fatalf("create webroot: %v", err)
	}
	if err := os.MkdirAll(cfg.LogDir, 0o755); err != nil {
		t.Fatalf("create log dir: %v", err)
	}
	eng := tasks.New(st, context.Background())
	return &harness{t: t, svc: New(cfg, sites.New(st, eng, auditLog, cfg)), cfg: cfg, st: st}
}

func (h *harness) addSite(domain string) store.Site {
	h.t.Helper()
	now := store.Now()
	site := store.Site{
		Domain:     domain,
		Root:       filepath.Join(h.cfg.Webroot, domain),
		PHPVersion: "none",
		Status:     store.SiteActive,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := os.MkdirAll(site.Root, 0o755); err != nil {
		h.t.Fatalf("create site root: %v", err)
	}
	if err := h.st.CreateSite(site); err != nil {
		h.t.Fatalf("CreateSite: %v", err)
	}
	return site
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s): %v", path, err)
	}
}

// accessLine renders one nginx combined-format line.
func accessLine(ts time.Time, request, status string, sent int64) string {
	return fmt.Sprintf(`1.2.3.4 - - [%s] "%s" %s %d "-" "test-agent"`,
		ts.Format("02/Jan/2006:15:04:05 -0700"), request, status, sent)
}

// localNoon returns noon local time daysAgo days before today.
func localNoon(daysAgo int) time.Time {
	now := time.Now().In(time.Local)
	return time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.Local).AddDate(0, 0, -daysAgo)
}

func wantAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %d %s", status, code)
	}
	api, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an apierr", err)
	}
	if api.Status != status || api.Code != code {
		t.Fatalf("error = %d %s, want %d %s (%v)", api.Status, api.Code, status, code, err)
	}
}

func TestUsage(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com")

	mustWrite(t, filepath.Join(site.Root, "index.html"), strings.Repeat("a", 100))
	mustWrite(t, filepath.Join(site.Root, "assets", "app.js"), strings.Repeat("b", 50))
	mustWrite(t, filepath.Join(site.Root, "assets", "sub", "deep.css"), strings.Repeat("c", 25))
	// Symlinks are skipped, not followed.
	if err := os.Symlink(filepath.Join(site.Root, "index.html"), filepath.Join(site.Root, "link.html")); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	if err := os.Symlink(filepath.Join(site.Root, "assets"), filepath.Join(site.Root, "assets-link")); err != nil {
		t.Fatalf("symlink dir: %v", err)
	}

	usage, err := h.svc.Usage("example.com")
	if err != nil {
		t.Fatalf("Usage: %v", err)
	}
	if usage.Domain != "example.com" || usage.Root != site.Root {
		t.Errorf("usage = %+v, want domain/root of example.com", usage)
	}
	if usage.Bytes != 175 {
		t.Errorf("bytes = %d, want 175", usage.Bytes)
	}
	if usage.Files != 3 {
		t.Errorf("files = %d, want 3", usage.Files)
	}
}

func TestUsageMissingWebrootIsZero(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com")
	if err := os.RemoveAll(site.Root); err != nil {
		t.Fatalf("remove webroot: %v", err)
	}
	usage, err := h.svc.Usage("example.com")
	if err != nil {
		t.Fatalf("Usage: %v", err)
	}
	if usage.Bytes != 0 || usage.Files != 0 {
		t.Errorf("usage = %+v, want zeros", usage)
	}
}

func TestUsageErrors(t *testing.T) {
	h := newHarness(t, nil)
	_, err := h.svc.Usage("bad_domain")
	wantAPIError(t, err, 400, "invalid_domain")
	_, err = h.svc.Usage("nope.example")
	wantAPIError(t, err, 404, "site_not_found")
}

func TestStats(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")

	lines := []string{
		accessLine(localNoon(0), "GET /index.html?from=ads HTTP/1.1", "200", 100),
		accessLine(localNoon(0), "GET /index.html HTTP/1.1", "200", 200),
		accessLine(localNoon(0), "GET /a/b HTTP/1.1", "404", 10),
		"garbage line that must be skipped",
		accessLine(localNoon(1), "GET /index.html HTTP/1.1", "200", 50),
		accessLine(localNoon(3), "GET /deep?q=1 HTTP/1.1", "200", 30),
		accessLine(localNoon(10), "GET /too-old HTTP/1.1", "200", 999),
	}
	mustWrite(t, filepath.Join(h.cfg.LogDir, "example.com.access.log"), strings.Join(lines, "\n")+"\n")

	stats, err := h.svc.Stats("example.com", 7)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.Domain != "example.com" || stats.Days != 7 {
		t.Errorf("stats = %+v, want domain example.com days 7", stats)
	}
	if stats.Requests != 5 {
		t.Errorf("requests = %d, want 5", stats.Requests)
	}
	if stats.Bytes != 390 {
		t.Errorf("bytes = %d, want 390", stats.Bytes)
	}

	if len(stats.PerDay) != 7 {
		t.Fatalf("perDay len = %d, want 7", len(stats.PerDay))
	}
	today := localNoon(0).Format("2006-01-02")
	for i, day := range stats.PerDay {
		if day.Date != localNoon(6-i).Format("2006-01-02") {
			t.Errorf("perDay[%d].Date = %q, want ascending ending today", i, day.Date)
		}
	}
	if last := stats.PerDay[6]; last.Date != today || last.Requests != 3 || last.Bytes != 310 {
		t.Errorf("today bucket = %+v, want 3 requests / 310 bytes", last)
	}
	if got := stats.PerDay[5]; got.Requests != 1 || got.Bytes != 50 {
		t.Errorf("yesterday bucket = %+v, want 1 request / 50 bytes", got)
	}
	if got := stats.PerDay[3]; got.Requests != 1 || got.Bytes != 30 {
		t.Errorf("three-days-ago bucket = %+v, want 1 request / 30 bytes", got)
	}
	if got := stats.PerDay[0]; got.Requests != 0 || got.Bytes != 0 {
		t.Errorf("oldest bucket = %+v, want zero activity", got)
	}

	wantPaths := []PathStat{
		{Path: "/index.html", Requests: 3},
		{Path: "/a/b", Requests: 1},
		{Path: "/deep", Requests: 1},
	}
	if !reflect.DeepEqual(stats.TopPaths, wantPaths) {
		t.Errorf("topPaths = %+v, want %+v", stats.TopPaths, wantPaths)
	}
}

func TestStatsTopPathsLimit(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")

	var lines []string
	for i := 0; i < 12; i++ {
		lines = append(lines, accessLine(localNoon(0), fmt.Sprintf("GET /p%02d HTTP/1.1", i), "200", 1))
	}
	lines = append(lines, accessLine(localNoon(0), "GET /hot HTTP/1.1", "200", 1))
	lines = append(lines, accessLine(localNoon(0), "GET /hot HTTP/1.1", "200", 1))
	lines = append(lines, accessLine(localNoon(0), "GET /hot HTTP/1.1", "200", 1))
	mustWrite(t, filepath.Join(h.cfg.LogDir, "example.com.access.log"), strings.Join(lines, "\n")+"\n")

	stats, err := h.svc.Stats("example.com", 1)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if len(stats.TopPaths) != 10 {
		t.Fatalf("topPaths len = %d, want 10", len(stats.TopPaths))
	}
	if stats.TopPaths[0] != (PathStat{Path: "/hot", Requests: 3}) {
		t.Errorf("topPaths[0] = %+v, want /hot first", stats.TopPaths[0])
	}
	if stats.TopPaths[1] != (PathStat{Path: "/p00", Requests: 1}) {
		t.Errorf("topPaths[1] = %+v, want /p00 (alphabetical tie-break)", stats.TopPaths[1])
	}
	if last := stats.TopPaths[9]; last.Path != "/p08" {
		t.Errorf("topPaths[9] = %+v, want /p08", last)
	}
}

func TestStatsMissingLogIsZero(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	stats, err := h.svc.Stats("example.com", 3)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.Requests != 0 || stats.Bytes != 0 {
		t.Errorf("stats = %+v, want zeros", stats)
	}
	if len(stats.PerDay) != 3 {
		t.Fatalf("perDay len = %d, want 3", len(stats.PerDay))
	}
	if len(stats.TopPaths) != 0 {
		t.Errorf("topPaths = %+v, want empty", stats.TopPaths)
	}
}

func TestStatsInvalidDays(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	for _, days := range []int{-1, 0, 91, 1000} {
		_, err := h.svc.Stats("example.com", days)
		wantAPIError(t, err, 400, "invalid_days")
	}
}

func TestStatsErrors(t *testing.T) {
	h := newHarness(t, nil)
	_, err := h.svc.Stats("bad_domain", 7)
	wantAPIError(t, err, 400, "invalid_domain")
	_, err = h.svc.Stats("nope.example", 7)
	wantAPIError(t, err, 404, "site_not_found")
}

func TestLogs(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	access := []string{"line1", "line2", "line3", "line4", "line5"}
	mustWrite(t, filepath.Join(h.cfg.LogDir, "example.com.access.log"), strings.Join(access, "\n")+"\n")
	mustWrite(t, filepath.Join(h.cfg.LogDir, "example.com.error.log"), "err1\nerr2\n")

	tail, err := h.svc.Logs("example.com", "access", 2)
	if err != nil {
		t.Fatalf("Logs(access): %v", err)
	}
	if !reflect.DeepEqual(tail, []string{"line4", "line5"}) {
		t.Errorf("access tail = %q, want [line4 line5]", tail)
	}

	tail, err = h.svc.Logs("example.com", "error", 200)
	if err != nil {
		t.Fatalf("Logs(error): %v", err)
	}
	if !reflect.DeepEqual(tail, []string{"err1", "err2"}) {
		t.Errorf("error tail = %q, want [err1 err2]", tail)
	}

	// Missing file: 200 with an empty (non-nil) list.
	if err := os.Remove(filepath.Join(h.cfg.LogDir, "example.com.error.log")); err != nil {
		t.Fatalf("remove error log: %v", err)
	}
	tail, err = h.svc.Logs("example.com", "error", 10)
	if err != nil {
		t.Fatalf("Logs(missing): %v", err)
	}
	if tail == nil || len(tail) != 0 {
		t.Errorf("missing log tail = %#v, want empty non-nil slice", tail)
	}
}

func TestLogsValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	_, err := h.svc.Logs("example.com", "bogus", 10)
	wantAPIError(t, err, 400, "invalid_kind")
	for _, lines := range []int{0, -1, 2001} {
		_, err := h.svc.Logs("example.com", "access", lines)
		wantAPIError(t, err, 400, "invalid_lines")
	}
	_, err = h.svc.Logs("bad_domain", "access", 10)
	wantAPIError(t, err, 400, "invalid_domain")
	_, err = h.svc.Logs("nope.example", "access", 10)
	wantAPIError(t, err, 404, "site_not_found")
}

func TestLogsReadsOnlyTail(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com")
	// The tail window is 256 KiB: an ancient marker followed by more than
	// that must be dropped.
	var b strings.Builder
	b.WriteString("ANCIENT-MARKER\n")
	filler := strings.Repeat("f", 127) + "\n"
	for i := 0; i < 3000; i++ {
		b.WriteString(filler)
	}
	b.WriteString("NEWEST-LINE\n")
	mustWrite(t, filepath.Join(h.cfg.LogDir, "example.com.access.log"), b.String())

	tail, err := h.svc.Logs("example.com", "access", 2000)
	if err != nil {
		t.Fatalf("Logs: %v", err)
	}
	if len(tail) == 0 || tail[len(tail)-1] != "NEWEST-LINE" {
		t.Errorf("tail does not end with NEWEST-LINE: %q", tail[len(tail)-1:])
	}
	for _, line := range tail {
		if line == "ANCIENT-MARKER" {
			t.Errorf("tail included a line outside the 256 KiB window")
		}
	}
}

func TestReadTailDropsPartialFirstLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "log")
	mustWrite(t, path, "aaaa\nbbbb\ncccc\n")

	data, err := readTail(path, 9)
	if err != nil {
		t.Fatalf("readTail: %v", err)
	}
	if got, want := string(data), "cccc\n"; got != want {
		t.Errorf("readTail(max=9) = %q, want %q", got, want)
	}

	data, err = readTail(path, 1<<20)
	if err != nil {
		t.Fatalf("readTail: %v", err)
	}
	if got, want := string(data), "aaaa\nbbbb\ncccc\n"; got != want {
		t.Errorf("readTail(whole) = %q, want %q", got, want)
	}

	if _, err := readTail(filepath.Join(t.TempDir(), "nope"), 10); err == nil {
		t.Error("readTail(missing) = nil, want error")
	}
}
