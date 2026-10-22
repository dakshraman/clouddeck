package processinfo

import (
	"strings"
	"testing"
)

func TestParseStat(t *testing.T) {
	line := "123 (nginx: worker) S 1 123 123 0 -1 4194304 10 0 0 0 10 20 0 0 20 0 1 0 12345 123456 789 0\n"
	stat, err := parseStat(123, line)
	if err != nil {
		t.Fatalf("parseStat: %v", err)
	}
	if stat.name != "nginx: worker" {
		t.Errorf("name = %q, want %q", stat.name, "nginx: worker")
	}
	if stat.ticks != 30 {
		t.Errorf("ticks = %d, want 30", stat.ticks)
	}
}

func TestParseCPUStat(t *testing.T) {
	data := []byte("cpu  100 0 50 850 0 0 0 0 0 0\ncpu0 50 0 25 425 0 0 0 0 0 0\n")
	total, ok := parseCPUStat(data)
	if !ok {
		t.Fatal("parseCPUStat returned !ok")
	}
	if total != 1000 {
		t.Errorf("total = %d, want 1000", total)
	}
}

func TestParseStatus(t *testing.T) {
	data := []byte("Name:\tnginx\nUid:\t33\t33\t33\t33\nVmRSS:\t2048 kB\n")
	uid, rss := parseStatus(data)
	if uid != "33" {
		t.Errorf("uid = %q, want 33", uid)
	}
	if rss != 2048*1024 {
		t.Errorf("rss = %d, want %d", rss, 2048*1024)
	}
}

func TestCleanCommand(t *testing.T) {
	got := cleanCommand([]byte("nginx\x00-g\x00daemon off;\x00"), "nginx")
	if got != "nginx -g daemon off;" {
		t.Errorf("cleanCommand = %q", got)
	}
	if got := cleanCommand(nil, "kworker/0:1"); got != "[kworker/0:1]" {
		t.Errorf("empty cleanCommand = %q", got)
	}
	long := strings.Repeat("a", maxCommandChars+10)
	got = cleanCommand([]byte(long), "x")
	if len([]rune(got)) != maxCommandChars+1 || !strings.HasSuffix(got, "…") {
		t.Errorf("long command was not truncated: %d runes", len([]rune(got)))
	}
}

func TestCPUPercent(t *testing.T) {
	if got := cpuPercent(10, 1600, 8); got != 5 {
		t.Errorf("cpuPercent = %v, want 5", got)
	}
	if got := cpuPercent(0, 100, 8); got != 0 {
		t.Errorf("idle cpuPercent = %v, want 0", got)
	}
	if got := cpuPercent(200, 100, 2); got != 200 {
		t.Errorf("clamped cpuPercent = %v, want 200", got)
	}
}

func TestMemoryPercent(t *testing.T) {
	if got := memoryPercent(512, 1024); got != 50 {
		t.Errorf("memoryPercent = %v, want 50", got)
	}
	if got := memoryPercent(512, 0); got != 0 {
		t.Errorf("zero-total memoryPercent = %v, want 0", got)
	}
}

func TestSortProcesses(t *testing.T) {
	byCPU := []Process{
		{PID: 1, CPUPercent: 1, RSSBytes: 100},
		{PID: 3, CPUPercent: 5, RSSBytes: 200},
		{PID: 2, CPUPercent: 5, RSSBytes: 50},
	}
	sortProcesses(byCPU, "cpu")
	if byCPU[0].PID != 3 || byCPU[1].PID != 2 || byCPU[2].PID != 1 {
		t.Errorf("cpu order = %d,%d,%d", byCPU[0].PID, byCPU[1].PID, byCPU[2].PID)
	}

	byMem := []Process{
		{PID: 1, CPUPercent: 1, RSSBytes: 100},
		{PID: 3, CPUPercent: 5, RSSBytes: 200},
		{PID: 2, CPUPercent: 5, RSSBytes: 50},
	}
	sortProcesses(byMem, "mem")
	if byMem[0].PID != 3 || byMem[1].PID != 1 || byMem[2].PID != 2 {
		t.Errorf("mem order = %d,%d,%d", byMem[0].PID, byMem[1].PID, byMem[2].PID)
	}
}

func TestNormalize(t *testing.T) {
	if got := normalizeSort("MEMORY"); got != "mem" {
		t.Errorf("normalizeSort = %q, want mem", got)
	}
	if got := normalizeSort(""); got != "cpu" {
		t.Errorf("default normalizeSort = %q, want cpu", got)
	}
	if got := normalizeLimit(0); got != DefaultLimit {
		t.Errorf("default limit = %d, want %d", got, DefaultLimit)
	}
	if got := normalizeLimit(MaxLimit + 1); got != MaxLimit {
		t.Errorf("max limit = %d, want %d", got, MaxLimit)
	}
}
