package analytics

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func TestSiteAnalytics(t *testing.T) {
	tmpDir := t.TempDir()
	logDir := filepath.Join(tmpDir, "logs")
	_ = os.MkdirAll(logDir, 0o755)

	st, err := store.Open(filepath.Join(tmpDir, "store.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	domain := "example.com"
	err = st.CreateSite(store.Site{Domain: domain, Root: filepath.Join(tmpDir, "example.com"), PHPVersion: "8.2"})
	if err != nil {
		t.Fatalf("create site: %v", err)
	}

	now := time.Now().UTC()
	timeFormat := "02/Jan/2006:15:04:05 -0700"

	// Create sample access log entries
	t1 := now.Add(-3 * time.Hour).Format(timeFormat)
	t2 := now.Add(-2 * time.Hour).Format(timeFormat)
	t3 := now.Add(-1 * time.Hour).Format(timeFormat)

	logLines := []string{
		fmt.Sprintf(`1.2.3.4 - - [%s] "GET / HTTP/1.1" 200 1024 "https://google.com" "Mozilla/5.0 Chrome/120"`, t1),
		fmt.Sprintf(`1.2.3.4 - - [%s] "GET /about HTTP/1.1" 200 512 "-" "Mozilla/5.0 Chrome/120"`, t2),
		fmt.Sprintf(`5.6.7.8 - - [%s] "GET /missing HTTP/1.1" 404 128 "-" "Mozilla/5.0 Firefox/121"`, t2),
		fmt.Sprintf(`66.249.66.1 - - [%s] "GET /blog HTTP/1.1" 200 2048 "-" "Googlebot/2.1 (+http://www.google.com/bot.html)"`, t3),
		fmt.Sprintf(`40.77.167.1 - - [%s] "GET /contact HTTP/1.1" 500 256 "https://bing.com" "Mozilla/5.0 (compatible; bingbot/2.0)"`, t3),
	}

	logPath := filepath.Join(logDir, domain+".access.log")
	_ = os.WriteFile(logPath, []byte(fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n", logLines[0], logLines[1], logLines[2], logLines[3], logLines[4])), 0o644)

	svc := New(config.Config{LogDir: logDir}, st)

	res, err := svc.GetSiteAnalytics(context.Background(), domain, "24h")
	if err != nil {
		t.Fatalf("GetSiteAnalytics failed: %v", err)
	}

	if res.TotalRequests != 5 {
		t.Errorf("expected 5 total requests, got %d", res.TotalRequests)
	}
	if res.TotalBandwidth != (1024 + 512 + 128 + 2048 + 256) {
		t.Errorf("unexpected total bandwidth: %d", res.TotalBandwidth)
	}
	// Unique visitors: 1.2.3.4 (Chrome), 5.6.7.8 (Firefox), 66.249.66.1 (Googlebot), 40.77.167.1 (bingbot) => 4 unique
	if res.UniqueVisitors != 4 {
		t.Errorf("expected 4 unique visitors, got %d", res.UniqueVisitors)
	}
	if res.StatusCodes["2xx"] != 3 {
		t.Errorf("expected 3 2xx requests, got %d", res.StatusCodes["2xx"])
	}
	if res.StatusCodes["4xx"] != 1 {
		t.Errorf("expected 1 4xx request, got %d", res.StatusCodes["4xx"])
	}
	if res.StatusCodes["5xx"] != 1 {
		t.Errorf("expected 1 5xx request, got %d", res.StatusCodes["5xx"])
	}

	// Bots
	if res.BotMetrics.BotRequests != 2 {
		t.Errorf("expected 2 bot requests, got %d", res.BotMetrics.BotRequests)
	}
	if res.BotMetrics.HumanRequests != 3 {
		t.Errorf("expected 3 human requests, got %d", res.BotMetrics.HumanRequests)
	}
	if len(res.BotMetrics.TopBots) != 2 {
		t.Errorf("expected 2 top bots, got %d", len(res.BotMetrics.TopBots))
	}

	// Top URLs
	if len(res.TopURLs) == 0 {
		t.Fatalf("expected non-empty top URLs")
	}

	// System analytics
	sys, err := svc.GetSystemAnalytics(context.Background(), "24h")
	if err != nil {
		t.Fatalf("GetSystemAnalytics failed: %v", err)
	}
	if sys.TotalRequests != 5 {
		t.Errorf("expected 5 system requests, got %d", sys.TotalRequests)
	}
	if sys.TotalSites != 1 {
		t.Errorf("expected 1 total site, got %d", sys.TotalSites)
	}
}
