package analytics

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	"clouddeck/agent/internal/store"
)

// accessLineRe matches standard nginx combined log format:
// $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
var accessLineRe = regexp.MustCompile(`^(\S+) \S+ \S+ \[([0-9]{2}/[A-Za-z]{3}/[0-9]{4}:[0-9]{2}:[0-9]{2}:[0-9]{2} [+-][0-9]{4})\] "([^"]*)" ([0-9]{3}) ([0-9]+|-) "(.*?)" "(.*?)"`)

// Fallback pattern matching the first 6 fields if referer or user-agent is omitted
var basicLineRe = regexp.MustCompile(`^(\S+) \S+ \S+ \[([0-9]{2}/[A-Za-z]{3}/[0-9]{4}:[0-9]{2}:[0-9]{2}:[0-9]{2} [+-][0-9]{4})\] "([^"]*)" ([0-9]{3}) ([0-9]+|-)`)

const maxLogReadBytes = 16 * 1024 * 1024 // Parse up to 16 MiB of most recent logs

// ItemCount represents a named entity with request count and bandwidth.
type ItemCount struct {
	Name     string `json:"name"`
	Requests int64  `json:"requests"`
	Bytes    int64  `json:"bytes,omitempty"`
}

// TimelinePoint represents aggregated traffic in a time bucket.
type TimelinePoint struct {
	Timestamp      string `json:"timestamp"`
	Requests       int64  `json:"requests"`
	Bandwidth      int64  `json:"bandwidth"`
	Status2xx      int64  `json:"status2xx"`
	Status3xx      int64  `json:"status3xx"`
	Status4xx      int64  `json:"status4xx"`
	Status5xx      int64  `json:"status5xx"`
	UniqueVisitors int64  `json:"uniqueVisitors"`
}

// BotMetrics categorizes crawler and bot traffic.
type BotMetrics struct {
	HumanRequests int64       `json:"humanRequests"`
	BotRequests   int64       `json:"botRequests"`
	TopBots       []ItemCount `json:"topBots"`
}

// SiteAnalytics contains full visitor and traffic analytics for a site.
type SiteAnalytics struct {
	Domain         string           `json:"domain"`
	Timeframe      string           `json:"timeframe"` // "24h", "7d", "30d"
	TotalRequests  int64            `json:"totalRequests"`
	UniqueVisitors int64            `json:"uniqueVisitors"`
	TotalBandwidth int64            `json:"totalBandwidth"`
	StatusCodes    map[string]int64 `json:"statusCodes"`
	Timeline       []TimelinePoint  `json:"timeline"`
	TopURLs        []ItemCount      `json:"topUrls"`
	TopReferrers   []ItemCount      `json:"topReferrers"`
	BotMetrics     BotMetrics       `json:"botMetrics"`
}

// SiteTrafficSummary gives a high-level summary of a site's traffic for system-wide stats.
type SiteTrafficSummary struct {
	Domain    string `json:"domain"`
	Requests  int64  `json:"requests"`
	Bandwidth int64  `json:"bandwidth"`
}

// SystemAnalytics contains system-wide aggregated traffic analytics across all sites.
type SystemAnalytics struct {
	Timeframe      string               `json:"timeframe"`
	TotalSites     int                  `json:"totalSites"`
	TotalRequests  int64                `json:"totalRequests"`
	TotalBandwidth int64                `json:"totalBandwidth"`
	UniqueVisitors int64                `json:"uniqueVisitors"`
	StatusCodes    map[string]int64     `json:"statusCodes"`
	TopSites       []SiteTrafficSummary `json:"topSites"`
	Timeline       []TimelinePoint      `json:"timeline"`
	BotMetrics     BotMetrics           `json:"botMetrics"`
}

// Service provides traffic and visitor analytics.
type Service struct {
	cfg config.Config
	st  *store.Store
}

// New creates an analytics Service.
func New(cfg config.Config, st *store.Store) *Service {
	return &Service{
		cfg: cfg,
		st:  st,
	}
}

type parsedEntry struct {
	IP        string
	Timestamp time.Time
	Method    string
	Path      string
	Status    int
	Bytes     int64
	Referrer  string
	UserAgent string
	BotName   string // empty if human
}

// GetSiteAnalytics parses access logs for a specific domain.
func (s *Service) GetSiteAnalytics(ctx context.Context, domain string, timeframe string) (SiteAnalytics, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return SiteAnalytics{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	tf, duration, bucketDuration, formatStr := parseTimeframe(timeframe)
	now := time.Now().UTC()
	startTime := now.Add(-duration)

	logPath := filepath.Join(s.cfg.LogDir, site.Domain+".access.log")
	entries := s.readLogEntries(logPath, startTime)

	analytics := s.aggregateSite(site.Domain, tf, startTime, now, bucketDuration, formatStr, entries)
	return analytics, nil
}

// GetSystemAnalytics aggregates access logs across all managed sites.
func (s *Service) GetSystemAnalytics(ctx context.Context, timeframe string) (SystemAnalytics, error) {
	sites := s.st.ListSites()
	tf, duration, bucketDuration, formatStr := parseTimeframe(timeframe)
	now := time.Now().UTC()
	startTime := now.Add(-duration)

	sys := SystemAnalytics{
		Timeframe:   tf,
		TotalSites:  len(sites),
		StatusCodes: map[string]int64{"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0},
	}

	allEntries := make([]parsedEntry, 0)
	siteSummaries := make([]SiteTrafficSummary, 0, len(sites))

	for _, site := range sites {
		logPath := filepath.Join(s.cfg.LogDir, site.Domain+".access.log")
		entries := s.readLogEntries(logPath, startTime)

		var siteReqs, siteBytes int64
		for _, e := range entries {
			siteReqs++
			siteBytes += e.Bytes
		}

		siteSummaries = append(siteSummaries, SiteTrafficSummary{
			Domain:    site.Domain,
			Requests:  siteReqs,
			Bandwidth: siteBytes,
		})

		allEntries = append(allEntries, entries...)
	}

	sort.Slice(siteSummaries, func(i, j int) bool {
		return siteSummaries[i].Requests > siteSummaries[j].Requests
	})
	sys.TopSites = siteSummaries

	// Aggregate all entries into timeline, bot metrics, etc.
	aggregated := s.aggregateSite("system", tf, startTime, now, bucketDuration, formatStr, allEntries)
	sys.TotalRequests = aggregated.TotalRequests
	sys.TotalBandwidth = aggregated.TotalBandwidth
	sys.UniqueVisitors = aggregated.UniqueVisitors
	sys.StatusCodes = aggregated.StatusCodes
	sys.Timeline = aggregated.Timeline
	sys.BotMetrics = aggregated.BotMetrics

	return sys, nil
}

func parseTimeframe(tf string) (cleanTf string, total time.Duration, bucket time.Duration, format string) {
	switch strings.ToLower(strings.TrimSpace(tf)) {
	case "7d":
		return "7d", 7 * 24 * time.Hour, 24 * time.Hour, "2006-01-02"
	case "30d":
		return "30d", 30 * 24 * time.Hour, 24 * time.Hour, "2006-01-02"
	default: // "24h"
		return "24h", 24 * time.Hour, time.Hour, "15:04"
	}
}

func (s *Service) readLogEntries(logPath string, startTime time.Time) []parsedEntry {
	data, err := readTail(logPath, maxLogReadBytes)
	if err != nil {
		return nil
	}

	entries := make([]parsedEntry, 0)
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		entry, ok := parseLine(line)
		if !ok || entry.Timestamp.Before(startTime) {
			continue
		}
		entries = append(entries, entry)
	}

	return entries
}

func parseLine(line string) (parsedEntry, bool) {
	var ip, timeStr, reqStr, statusStr, bytesStr, referer, ua string

	if m := accessLineRe.FindStringSubmatch(line); m != nil {
		ip = m[1]
		timeStr = m[2]
		reqStr = m[3]
		statusStr = m[4]
		bytesStr = m[5]
		referer = m[6]
		ua = m[7]
	} else if m := basicLineRe.FindStringSubmatch(line); m != nil {
		ip = m[1]
		timeStr = m[2]
		reqStr = m[3]
		statusStr = m[4]
		bytesStr = m[5]
	} else {
		return parsedEntry{}, false
	}

	ts, err := time.Parse("02/Jan/2006:15:04:05 -0700", timeStr)
	if err != nil {
		return parsedEntry{}, false
	}

	status, _ := strconv.Atoi(statusStr)
	bytesSent, _ := strconv.ParseInt(bytesStr, 10, 64)

	method := "GET"
	path := "/"
	parts := strings.Fields(reqStr)
	if len(parts) >= 2 {
		method = parts[0]
		path = parts[1]
	}

	botName := detectBot(ua)

	return parsedEntry{
		IP:        ip,
		Timestamp: ts.UTC(),
		Method:    method,
		Path:      path,
		Status:    status,
		Bytes:     bytesSent,
		Referrer:  cleanReferrer(referer),
		UserAgent: ua,
		BotName:   botName,
	}, true
}

func cleanReferrer(ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" || ref == "-" {
		return "Direct"
	}
	// Strip scheme if present
	if idx := strings.Index(ref, "://"); idx != -1 {
		ref = ref[idx+3:]
	}
	if slash := strings.Index(ref, "/"); slash != -1 {
		ref = ref[:slash]
	}
	return ref
}

func detectBot(ua string) string {
	if ua == "" || ua == "-" {
		return ""
	}
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "googlebot"):
		return "Googlebot"
	case strings.Contains(lower, "bingbot"):
		return "Bingbot"
	case strings.Contains(lower, "ahrefsbot"):
		return "AhrefsBot"
	case strings.Contains(lower, "semrushbot"):
		return "SemrushBot"
	case strings.Contains(lower, "yandex"):
		return "YandexBot"
	case strings.Contains(lower, "duckduckbot"):
		return "DuckDuckBot"
	case strings.Contains(lower, "baiduspider"):
		return "Baiduspider"
	case strings.Contains(lower, "applebot"):
		return "Applebot"
	case strings.Contains(lower, "slurp"):
		return "Yahoo Slurp"
	case strings.Contains(lower, "bot") || strings.Contains(lower, "spider") || strings.Contains(lower, "crawler"):
		return "Other Crawler"
	case strings.Contains(lower, "curl") || strings.Contains(lower, "wget") || strings.Contains(lower, "python-requests"):
		return "CLI / Tool"
	default:
		return ""
	}
}

func (s *Service) aggregateSite(domain string, tf string, start time.Time, now time.Time, bucketDur time.Duration, formatStr string, entries []parsedEntry) SiteAnalytics {
	statusCodes := map[string]int64{"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
	pathMap := make(map[string]*ItemCount)
	refMap := make(map[string]*ItemCount)
	botMap := make(map[string]*ItemCount)
	uniqueIPs := make(map[string]bool)

	// Initialize timeline buckets
	type bucketData struct {
		point   TimelinePoint
		visitor map[string]bool
	}

	bucketCount := int(now.Sub(start) / bucketDur)
	if bucketCount < 1 {
		bucketCount = 1
	}
	buckets := make([]*bucketData, 0, bucketCount)

	curr := start
	for curr.Before(now) || curr.Equal(now) {
		tsStr := curr.Format(formatStr)
		buckets = append(buckets, &bucketData{
			point: TimelinePoint{
				Timestamp: tsStr,
			},
			visitor: make(map[string]bool),
		})
		curr = curr.Add(bucketDur)
	}

	var totalReqs, totalBytes int64
	var humanReqs, botReqs int64

	for _, e := range entries {
		totalReqs++
		totalBytes += e.Bytes

		// Status breakdown
		switch {
		case e.Status >= 200 && e.Status < 300:
			statusCodes["2xx"]++
		case e.Status >= 300 && e.Status < 400:
			statusCodes["3xx"]++
		case e.Status >= 400 && e.Status < 500:
			statusCodes["4xx"]++
		case e.Status >= 500:
			statusCodes["5xx"]++
		}

		// Privacy-preserving visitor identification
		hasher := sha256.New()
		hasher.Write([]byte(e.IP + "|" + e.UserAgent))
		visitorHash := hex.EncodeToString(hasher.Sum(nil))[:16]
		uniqueIPs[visitorHash] = true

		// Top URLs
		if e.Path != "" {
			if item, exists := pathMap[e.Path]; exists {
				item.Requests++
				item.Bytes += e.Bytes
			} else {
				pathMap[e.Path] = &ItemCount{Name: e.Path, Requests: 1, Bytes: e.Bytes}
			}
		}

		// Referrers
		if e.Referrer != "" {
			if item, exists := refMap[e.Referrer]; exists {
				item.Requests++
			} else {
				refMap[e.Referrer] = &ItemCount{Name: e.Referrer, Requests: 1}
			}
		}

		// Bots vs Humans
		if e.BotName != "" {
			botReqs++
			if item, exists := botMap[e.BotName]; exists {
				item.Requests++
			} else {
				botMap[e.BotName] = &ItemCount{Name: e.BotName, Requests: 1}
			}
		} else {
			humanReqs++
		}

		// Bucket assignment
		bIdx := int(e.Timestamp.Sub(start) / bucketDur)
		if bIdx >= 0 && bIdx < len(buckets) {
			b := buckets[bIdx]
			b.point.Requests++
			b.point.Bandwidth += e.Bytes
			b.visitor[visitorHash] = true
			switch {
			case e.Status >= 200 && e.Status < 300:
				b.point.Status2xx++
			case e.Status >= 300 && e.Status < 400:
				b.point.Status3xx++
			case e.Status >= 400 && e.Status < 500:
				b.point.Status4xx++
			case e.Status >= 500:
				b.point.Status5xx++
			}
		}
	}

	// Prepare timeline
	timeline := make([]TimelinePoint, len(buckets))
	for i, b := range buckets {
		b.point.UniqueVisitors = int64(len(b.visitor))
		timeline[i] = b.point
	}

	// Top URLs sorted
	topURLs := make([]ItemCount, 0, len(pathMap))
	for _, item := range pathMap {
		topURLs = append(topURLs, *item)
	}
	sort.Slice(topURLs, func(i, j int) bool {
		return topURLs[i].Requests > topURLs[j].Requests
	})
	if len(topURLs) > 10 {
		topURLs = topURLs[:10]
	}

	// Top Referrers sorted
	topRefs := make([]ItemCount, 0, len(refMap))
	for _, item := range refMap {
		topRefs = append(topRefs, *item)
	}
	sort.Slice(topRefs, func(i, j int) bool {
		return topRefs[i].Requests > topRefs[j].Requests
	})
	if len(topRefs) > 10 {
		topRefs = topRefs[:10]
	}

	// Top Bots sorted
	topBots := make([]ItemCount, 0, len(botMap))
	for _, item := range botMap {
		topBots = append(topBots, *item)
	}
	sort.Slice(topBots, func(i, j int) bool {
		return topBots[i].Requests > topBots[j].Requests
	})

	return SiteAnalytics{
		Domain:         domain,
		Timeframe:      tf,
		TotalRequests:  totalReqs,
		UniqueVisitors: int64(len(uniqueIPs)),
		TotalBandwidth: totalBytes,
		StatusCodes:    statusCodes,
		Timeline:       timeline,
		TopURLs:        topURLs,
		TopReferrers:   topRefs,
		BotMetrics: BotMetrics{
			HumanRequests: humanReqs,
			BotRequests:   botReqs,
			TopBots:       topBots,
		},
	}
}

// readTail reads up to maxBytes from the end of a file.
func readTail(path string, maxBytes int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}

	size := info.Size()
	offset := int64(0)
	if size > maxBytes {
		offset = size - maxBytes
	}

	buf := make([]byte, size-offset)
	_, err = f.ReadAt(buf, offset)
	if err != nil && err != io.EOF {
		return nil, err
	}

	// If we skipped the beginning of the file, discard the first partial line
	if offset > 0 {
		if idx := strings.IndexByte(string(buf), '\n'); idx >= 0 && idx+1 < len(buf) {
			buf = buf[idx+1:]
		}
	}

	return buf, nil
}
