// Package processinfo collects a short /proc sample for GET /v1/processes.
// CPU percentages are measured over a sampling window so the list reflects
// current load rather than a process's lifetime average.
package processinfo

import (
	"fmt"
	"math"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultLimit    = 15
	MaxLimit        = 100
	maxCommandChars = 512
	sampleWindow    = 300 * time.Millisecond
)

// Process is one row in the process list.
type Process struct {
	PID           int     `json:"pid"`
	User          string  `json:"user"`
	Command       string  `json:"command"`
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryPercent float64 `json:"memoryPercent"`
	RSSBytes      uint64  `json:"rssBytes"`
}

// Snapshot is the /v1/processes response body.
type Snapshot struct {
	Processes      []Process `json:"processes"`
	TotalProcesses int       `json:"totalProcesses"`
	SampledAt      string    `json:"sampledAt"`
}

type procStat struct {
	name  string
	ticks uint64
}

type sample struct {
	total uint64
	byPID map[int]procStat
}

// Collect returns the top processes by CPU or memory. It takes two /proc
// samples 300ms apart; on systems without /proc it returns an empty list.
func Collect(sortBy string, limit int) Snapshot {
	sortBy = normalizeSort(sortBy)
	limit = normalizeLimit(limit)
	now := time.Now().UTC().Format(time.RFC3339)

	first, ok := takeSample()
	if !ok {
		return Snapshot{Processes: []Process{}, SampledAt: now}
	}
	time.Sleep(sampleWindow)
	second, ok := takeSample()
	if !ok {
		return Snapshot{Processes: []Process{}, SampledAt: now}
	}

	var deltaTotal uint64
	if second.total > first.total {
		deltaTotal = second.total - first.total
	}
	cores := runtime.NumCPU()
	memTotal := totalMemory()
	users := userNames()
	processes := make([]Process, 0, len(second.byPID))

	for pid, current := range second.byPID {
		previous, seen := first.byPID[pid]
		if !seen {
			continue
		}
		var deltaProc uint64
		if current.ticks > previous.ticks {
			deltaProc = current.ticks - previous.ticks
		}
		uid, rss := readStatus(pid)
		processes = append(processes, Process{
			PID:           pid,
			User:          userName(users, uid),
			Command:       readCommand(pid, current.name),
			CPUPercent:    cpuPercent(deltaProc, deltaTotal, cores),
			MemoryPercent: memoryPercent(rss, memTotal),
			RSSBytes:      rss,
		})
	}

	sortProcesses(processes, sortBy)
	total := len(processes)
	if len(processes) > limit {
		processes = processes[:limit]
	}
	return Snapshot{
		Processes:      processes,
		TotalProcesses: total,
		SampledAt:      time.Now().UTC().Format(time.RFC3339),
	}
}

func takeSample() (sample, bool) {
	total, ok := cpuTotal()
	if !ok {
		return sample{}, false
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return sample{}, false
	}
	byPID := make(map[int]procStat, len(entries))
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}
		stat, err := readStat(pid)
		if err != nil {
			continue
		}
		byPID[pid] = stat
	}
	return sample{total: total, byPID: byPID}, true
}

func readStat(pid int) (procStat, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return procStat{}, err
	}
	return parseStat(pid, string(data))
}

func parseStat(pid int, line string) (procStat, error) {
	open := strings.IndexByte(line, '(')
	close := strings.LastIndexByte(line, ')')
	if open < 0 || close <= open {
		return procStat{}, fmt.Errorf("malformed stat line for pid %d", pid)
	}
	fields := strings.Fields(line[close+1:])
	if len(fields) < 13 {
		return procStat{}, fmt.Errorf("short stat line for pid %d", pid)
	}
	utime, err := strconv.ParseUint(fields[11], 10, 64)
	if err != nil {
		return procStat{}, fmt.Errorf("parse utime for pid %d: %w", pid, err)
	}
	stime, err := strconv.ParseUint(fields[12], 10, 64)
	if err != nil {
		return procStat{}, fmt.Errorf("parse stime for pid %d: %w", pid, err)
	}
	return procStat{
		name:  line[open+1 : close],
		ticks: utime + stime,
	}, nil
}

func cpuTotal() (uint64, bool) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, false
	}
	return parseCPUStat(data)
}

func parseCPUStat(data []byte) (uint64, bool) {
	line, _, _ := strings.Cut(string(data), "\n")
	fields := strings.Fields(line)
	if len(fields) < 2 || fields[0] != "cpu" {
		return 0, false
	}
	var total uint64
	for _, field := range fields[1:] {
		value, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return 0, false
		}
		total += value
	}
	return total, true
}

func readStatus(pid int) (string, uint64) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return "", 0
	}
	return parseStatus(data)
}

func parseStatus(data []byte) (string, uint64) {
	var uid string
	var rssBytes uint64
	for _, line := range strings.Split(string(data), "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) == 0 {
			continue
		}
		switch key {
		case "Uid":
			uid = fields[0]
		case "VmRSS":
			if kb, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
				rssBytes = kb * 1024
			}
		}
	}
	return uid, rssBytes
}

func readCommand(pid int, name string) string {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return "[" + name + "]"
	}
	return cleanCommand(data, name)
}

func cleanCommand(raw []byte, name string) string {
	command := strings.TrimSpace(strings.ReplaceAll(strings.TrimRight(string(raw), "\x00"), "\x00", " "))
	if command == "" {
		return "[" + name + "]"
	}
	runes := []rune(command)
	if len(runes) > maxCommandChars {
		return string(runes[:maxCommandChars]) + "…"
	}
	return command
}

func userNames() map[string]string {
	names := make(map[string]string)
	data, err := os.ReadFile("/etc/passwd")
	if err != nil {
		return names
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Split(line, ":")
		if len(fields) >= 3 {
			names[fields[2]] = fields[0]
		}
	}
	return names
}

func userName(names map[string]string, uid string) string {
	if uid == "" {
		return "—"
	}
	if name := names[uid]; name != "" {
		return name
	}
	return uid
}

func totalMemory() uint64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found || key != "MemTotal" {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) == 0 {
			continue
		}
		if kb, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
			return kb * 1024
		}
	}
	return 0
}

func cpuPercent(deltaProc, deltaTotal uint64, cores int) float64 {
	if deltaTotal == 0 || cores < 1 {
		return 0
	}
	value := 100 * float64(deltaProc) / float64(deltaTotal) * float64(cores)
	if max := float64(cores) * 100; value > max {
		value = max
	}
	return round1(value)
}

func memoryPercent(rss, total uint64) float64 {
	if total == 0 {
		return 0
	}
	value := 100 * float64(rss) / float64(total)
	if value > 100 {
		value = 100
	}
	return round1(value)
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}

func normalizeSort(sortBy string) string {
	switch strings.ToLower(sortBy) {
	case "mem", "memory", "rss":
		return "mem"
	default:
		return "cpu"
	}
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return DefaultLimit
	}
	if limit > MaxLimit {
		return MaxLimit
	}
	return limit
}

func sortProcesses(processes []Process, sortBy string) {
	sort.SliceStable(processes, func(i, j int) bool {
		left, right := processes[i], processes[j]
		if sortBy == "mem" {
			if left.RSSBytes != right.RSSBytes {
				return left.RSSBytes > right.RSSBytes
			}
			if left.MemoryPercent != right.MemoryPercent {
				return left.MemoryPercent > right.MemoryPercent
			}
		} else {
			if left.CPUPercent != right.CPUPercent {
				return left.CPUPercent > right.CPUPercent
			}
			// Break CPU ties by memory so an idle host still shows meaningful rows.
			if left.RSSBytes != right.RSSBytes {
				return left.RSSBytes > right.RSSBytes
			}
		}
		return left.PID < right.PID
	})
}
