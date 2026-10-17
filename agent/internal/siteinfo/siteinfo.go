// Package siteinfo computes read-only per-site information: disk usage,
// access-log statistics and log tails (docs/api.md section 1.7).
package siteinfo

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
)

// Caps from docs/api.md section 1.7: stats parse at most the last 64 MiB of
// the access log, log tails read at most the last 256 KiB.
const (
	maxStatsBytes = 64 << 20
	maxLogBytes   = 256 << 10
	maxLogLines   = 2000
	maxStatsDays  = 90
	topPathCount  = 10
)

// accessLineRe matches the nginx combined format prefix:
// $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
var accessLineRe = regexp.MustCompile(`^\S+ \S+ \S+ \[([0-9]{2}/[A-Za-z]{3}/[0-9]{4}:[0-9]{2}:[0-9]{2}:[0-9]{2} [+-][0-9]{4})\] "([^"]*)" ([0-9]{3}) ([0-9]+|-)`)

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
// Symlinks are skipped and never followed.
func (s *Service) Usage(domain string) (Usage, error) {
	site, err := s.sites.Get(domain)
	if err != nil {
		return Usage{}, err
	}
	var bytesTotal, files int64
	walkErr := filepath.WalkDir(site.Root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			if path == site.Root {
				return fs.SkipAll // webroot missing: report zero usage
			}
			return nil // unreadable entry: skip it
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		if entry.Type().IsRegular() {
			if info, err := entry.Info(); err == nil {
				bytesTotal += info.Size()
				files++
			}
		}
		return nil
	})
	if walkErr != nil {
		return Usage{}, apierr.Internal(fmt.Sprintf("walk webroot %s: %v", site.Root, walkErr))
	}
	return Usage{Domain: site.Domain, Root: site.Root, Bytes: bytesTotal, Files: files}, nil
}

// Stats parses the site's access log into per-day buckets and top paths.
func (s *Service) Stats(domain string, days int) (Stats, error) {
	if days < 1 || days > maxStatsDays {
		return Stats{}, apierr.BadRequest("invalid_days", fmt.Sprintf("days must be between 1 and %d", maxStatsDays))
	}
	site, err := s.sites.Get(domain)
	if err != nil {
		return Stats{}, err
	}
	stats := Stats{Domain: site.Domain, Days: days, PerDay: []DayStat{}, TopPaths: []PathStat{}}

	now := time.Now().In(time.Local)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local).AddDate(0, 0, -(days - 1))
	type bucket struct{ requests, bytes int64 }
	buckets := make(map[string]*bucket, days)
	for i := 0; i < days; i++ {
		buckets[start.AddDate(0, 0, i).Format("2006-01-02")] = &bucket{}
	}
	paths := make(map[string]int64)

	data, err := readTail(filepath.Join(s.cfg.LogDir, site.Domain+".access.log"), maxStatsBytes)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			data = nil // no log yet: zero activity, still N day buckets
		} else {
			return Stats{}, apierr.Internal(fmt.Sprintf("read access log: %v", err))
		}
	}
	for _, line := range strings.Split(string(data), "\n") {
		m := accessLineRe.FindStringSubmatch(line)
		if m == nil {
			continue // skip unparseable lines
		}
		ts, err := time.Parse("02/Jan/2006:15:04:05 -0700", m[1])
		if err != nil {
			continue
		}
		local := ts.In(time.Local)
		if local.Before(start) {
			continue
		}
		b, ok := buckets[local.Format("2006-01-02")]
		if !ok {
			continue // outside the requested window (or future-dated)
		}
		sent, err := strconv.ParseInt(m[4], 10, 64)
		if err != nil {
			sent = 0 // "-" body size still counts as a request
		}
		b.requests++
		b.bytes += sent
		stats.Requests++
		stats.Bytes += sent
		if path := requestPath(m[2]); path != "" {
			paths[path]++
		}
	}

	for i := 0; i < days; i++ {
		date := start.AddDate(0, 0, i).Format("2006-01-02")
		b := buckets[date]
		stats.PerDay = append(stats.PerDay, DayStat{Date: date, Requests: b.requests, Bytes: b.bytes})
	}
	stats.TopPaths = topPaths(paths, topPathCount)
	return stats, nil
}

// Logs returns the tail of the site's access or error log.
func (s *Service) Logs(domain, kind string, lines int) ([]string, error) {
	if kind != "access" && kind != "error" {
		return nil, apierr.BadRequest("invalid_kind", "kind must be \"access\" or \"error\"")
	}
	if lines < 1 || lines > maxLogLines {
		return nil, apierr.BadRequest("invalid_lines", fmt.Sprintf("lines must be between 1 and %d", maxLogLines))
	}
	site, err := s.sites.Get(domain)
	if err != nil {
		return nil, err
	}
	data, err := readTail(filepath.Join(s.cfg.LogDir, site.Domain+"."+kind+".log"), maxLogBytes)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []string{}, nil
		}
		return nil, apierr.Internal(fmt.Sprintf("read %s log: %v", kind, err))
	}
	text := strings.TrimRight(string(data), "\n")
	if text == "" {
		return []string{}, nil
	}
	all := strings.Split(text, "\n")
	if len(all) > lines {
		all = all[len(all)-lines:]
	}
	return all, nil
}

// readTail reads at most max bytes from the end of the file. When the file is
// longer, the leading partial line is dropped.
func readTail(path string, max int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := info.Size()
	truncated := size > max
	start := int64(0)
	if truncated {
		start = size - max
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	if truncated {
		if i := bytes.IndexByte(data, '\n'); i >= 0 {
			data = data[i+1:]
		} else {
			data = nil
		}
	}
	return data, nil
}

// requestPath extracts the request target, stripping any query string.
func requestPath(request string) string {
	fields := strings.Fields(request)
	if len(fields) < 2 {
		return ""
	}
	path := fields[1]
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	return path
}

// topPaths returns the n most requested paths, highest count first and ties
// broken alphabetically.
func topPaths(counts map[string]int64, n int) []PathStat {
	out := make([]PathStat, 0, len(counts))
	for path, requests := range counts {
		out = append(out, PathStat{Path: path, Requests: requests})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Requests != out[j].Requests {
			return out[i].Requests > out[j].Requests
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}
