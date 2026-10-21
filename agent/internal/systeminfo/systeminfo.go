// Package systeminfo collects host metrics for GET /v1/system. Every metric
// is best effort: unreadable sources report zeros instead of failing.
package systeminfo

import (
	"math"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// System is the /v1/system response body.
type System struct {
	Hostname      string  `json:"hostname"`
	OS            string  `json:"os"`
	Kernel        string  `json:"kernel,omitempty"`
	UptimeSeconds float64 `json:"uptimeSeconds"`
	CPU           CPU     `json:"cpu"`
	Memory        Memory  `json:"memory"`
	Disk          Disk    `json:"disk"`
	DryRun        bool    `json:"dryRun"`
	AgentVersion  string  `json:"agentVersion,omitempty"`
	AgentTime     string  `json:"agentTime,omitempty"`
}

// CPU holds processor details.
type CPU struct {
	Cores        int     `json:"cores"`
	UsagePercent float64 `json:"usagePercent"`
}

// Memory holds RAM details.
type Memory struct {
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	UsedPercent float64 `json:"usedPercent"`
}

// Disk holds root filesystem details.
type Disk struct {
	Mount       string  `json:"mount"`
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	UsedPercent float64 `json:"usedPercent"`
	Note        string  `json:"note,omitempty"`
}

// Collect gathers all metrics. It needs about 200ms for the CPU sample.
func Collect() System {
	sys := System{
		OS:   runtime.GOOS + "/" + runtime.GOARCH,
		CPU:  CPU{Cores: runtime.NumCPU()},
		Disk: Disk{Mount: "/"},
	}
	if hostname, err := os.Hostname(); err == nil {
		sys.Hostname = hostname
	}
	if out, err := exec.Command("uname", "-r").Output(); err == nil {
		sys.Kernel = strings.TrimSpace(string(out))
	}
	sys.UptimeSeconds = uptimeSeconds()
	sys.CPU.UsagePercent = cpuUsage()
	sys.Memory = memory()
	if total, used, ok := diskStats(); ok {
		sys.Disk.TotalBytes = total
		sys.Disk.UsedBytes = used
		sys.Disk.UsedPercent = percent(used, total)
	} else {
		sys.Disk.Note = "disk metrics unavailable on this platform"
	}
	return sys
}

// cpuUsage samples /proc/stat twice 200ms apart.
func cpuUsage() float64 {
	firstIdle, firstTotal, ok := cpuSample()
	if !ok {
		return 0
	}
	time.Sleep(200 * time.Millisecond)
	secondIdle, secondTotal, ok := cpuSample()
	if !ok {
		return 0
	}
	totalDelta := secondTotal - firstTotal
	if totalDelta == 0 {
		return 0
	}
	idleDelta := secondIdle - firstIdle
	usage := 100 * (1 - float64(idleDelta)/float64(totalDelta))
	return round1(math.Min(math.Max(usage, 0), 100))
}

// cpuSample reads the aggregate "cpu" jiffies line from /proc/stat.
func cpuSample() (idle, total uint64, ok bool) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, false
	}
	line := string(data)
	if i := strings.IndexByte(line, '\n'); i >= 0 {
		line = line[:i]
	}
	if !strings.HasPrefix(line, "cpu ") {
		return 0, 0, false
	}
	fields := strings.Fields(line)[1:]
	if len(fields) < 4 {
		return 0, 0, false
	}
	values := make([]uint64, 0, len(fields))
	for _, f := range fields {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return 0, 0, false
		}
		values = append(values, v)
	}
	// user, nice, system, idle, iowait, irq, softirq, steal
	idle = values[3] + values[4]
	for _, v := range values {
		total += v
	}
	return idle, total, true
}

// memory reads MemTotal and MemAvailable from /proc/meminfo.
func memory() Memory {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return Memory{}
	}
	var totalKB, availKB, freeKB uint64
	for _, line := range strings.Split(string(data), "\n") {
		key, value, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) == 0 {
			continue
		}
		n, err := strconv.ParseUint(fields[0], 10, 64)
		if err != nil {
			continue
		}
		switch key {
		case "MemTotal":
			totalKB = n
		case "MemAvailable":
			availKB = n
		case "MemFree":
			freeKB = n
		}
	}
	if totalKB == 0 {
		return Memory{}
	}
	if availKB == 0 {
		availKB = freeKB
	}
	if availKB > totalKB {
		availKB = totalKB
	}
	total := totalKB * 1024
	used := (totalKB - availKB) * 1024
	return Memory{TotalBytes: total, UsedBytes: used, UsedPercent: percent(used, total)}
}

// uptimeSeconds reads the first field of /proc/uptime.
func uptimeSeconds() float64 {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	field, _, _ := strings.Cut(strings.TrimSpace(string(data)), " ")
	seconds, err := strconv.ParseFloat(field, 64)
	if err != nil {
		return 0
	}
	return round1(seconds)
}

func percent(used, total uint64) float64 {
	if total == 0 {
		return 0
	}
	return round1(100 * float64(used) / float64(total))
}

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}
