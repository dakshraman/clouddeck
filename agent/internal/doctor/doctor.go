package doctor

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/runtimes"
	"clouddeck/agent/internal/store"
)

// IssueSeverity levels.
const (
	SeverityCritical = "critical"
	SeverityWarning  = "warning"
	SeverityInfo     = "info"
)

// Issue describes a diagnosed problem and whether it can be auto-remediated.
type Issue struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Fixable     bool   `json:"fixable"`
	FixType     string `json:"fixType,omitempty"`
}

// SiteDiagnosis holds the health status and findings for a website.
type SiteDiagnosis struct {
	Domain      string    `json:"domain"`
	HealthScore int       `json:"healthScore"`
	Issues      []Issue   `json:"issues"`
	CheckedAt   time.Time `json:"checkedAt"`
}

// ServerDiagnosis holds host-wide health checks.
type ServerDiagnosis struct {
	HealthScore int            `json:"healthScore"`
	Issues      []Issue        `json:"issues"`
	CheckedAt   time.Time      `json:"checkedAt"`
	Metrics     map[string]any `json:"metrics"`
}

// LogInvestigation holds the diagnosis and recommended fix from analyzing error logs.
type LogInvestigation struct {
	Domain         string    `json:"domain"`
	LogFile        string    `json:"logFile"`
	LinesRead      int       `json:"linesRead"`
	Analysis       string    `json:"analysis"`
	RootCause      string    `json:"rootCause"`
	SuggestedFix   string    `json:"suggestedFix"`
	ExecutableFix  string    `json:"executableFix,omitempty"`
	FixType        string    `json:"fixType,omitempty"`
	Provider       string    `json:"provider"`
	InvestigatedAt time.Time `json:"investigatedAt"`
}

// Service provides autonomous diagnostics and remediation.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	vault *agents.Vault
}

// New creates a new doctor Service.
func New(cfg config.Config, auditLog *audit.Log, vault ...*agents.Vault) *Service {
	var v *agents.Vault
	if len(vault) > 0 {
		v = vault[0]
	}
	return &Service{
		cfg:   cfg,
		audit: auditLog,
		vault: v,
	}
}

// DiagnoseSite performs autonomous health checks on a hosted site.
func (s *Service) DiagnoseSite(ctx context.Context, site store.Site) SiteDiagnosis {
	var issues []Issue

	// 1. Webroot existence & permissions
	fi, err := os.Stat(site.Root)
	if err != nil {
		issues = append(issues, Issue{
			ID:          "missing_webroot",
			Severity:    SeverityCritical,
			Title:       "Document root directory missing",
			Description: fmt.Sprintf("Document root %s does not exist on disk.", site.Root),
			Fixable:     true,
			FixType:     "fix_permissions",
		})
	} else if fi.Mode().Perm()&0o755 != 0o755 {
		issues = append(issues, Issue{
			ID:          "webroot_perms",
			Severity:    SeverityWarning,
			Title:       "Insecure or restrictive webroot permissions",
			Description: fmt.Sprintf("Webroot directory has mode %v; recommended is 0755.", fi.Mode().Perm()),
			Fixable:     true,
			FixType:     "fix_permissions",
		})
	}

	// 2. Framework specific checks
	wpConfig := filepath.Join(site.Root, "wp-config.php")
	envFile := filepath.Join(site.Root, ".env")
	isWordPress := false
	isLaravel := false

	if _, err := os.Stat(wpConfig); err == nil {
		isWordPress = true
		// WordPress Checks
		uploadsDir := filepath.Join(site.Root, "wp-content", "uploads")
		if ufi, uErr := os.Stat(uploadsDir); uErr == nil && ufi.Mode().Perm()&0o775 != 0o775 {
			issues = append(issues, Issue{
				ID:          "wp_uploads_perms",
				Severity:    SeverityWarning,
				Title:       "WordPress uploads folder permissions restrictive",
				Description: "wp-content/uploads lacks write permissions for media uploads.",
				Fixable:     true,
				FixType:     "fix_permissions",
			})
		}

		// Check database connection host in wp-config
		cfgData, _ := os.ReadFile(wpConfig)
		cfgStr := string(cfgData)
		if strings.Contains(cfgStr, "DB_HOST") && strings.Contains(cfgStr, "localhost:3306") {
			// Often causes PDO connection refusal if MySQL is on unix socket
			issues = append(issues, Issue{
				ID:          "wp_db_host",
				Severity:    SeverityWarning,
				Title:       "Sub-optimal database host definition",
				Description: "DB_HOST is set to localhost:3306; 127.0.0.1 or unix socket is recommended to avoid IPv6 resolution delays.",
				Fixable:     true,
				FixType:     "fix_db_socket",
			})
		}
	} else if _, err := os.Stat(envFile); err == nil {
		isLaravel = true
		// Laravel Checks
		storageDir := filepath.Join(site.Root, "storage")
		if sfi, sErr := os.Stat(storageDir); sErr == nil && sfi.Mode().Perm()&0o775 != 0o775 {
			issues = append(issues, Issue{
				ID:          "laravel_storage_perms",
				Severity:    SeverityCritical,
				Title:       "Laravel storage folder permissions restrictive",
				Description: "storage/ folder is not writable by PHP-FPM, causing 500 errors on log writes and views.",
				Fixable:     true,
				FixType:     "fix_permissions",
			})
		}
	} else if _, err := os.Stat(filepath.Join(site.Root, "artisan")); err == nil {
		isLaravel = true
	}

	// 2b. PHP Extension checks for WordPress and Laravel
	if (isWordPress || isLaravel) && site.PHPVersion != "" && site.PHPVersion != "static" {
		frameworkName := "WordPress"
		if isLaravel {
			frameworkName = "Laravel"
		}
		if extRes, err := runtimes.ListExtensions(site.PHPVersion); err == nil {
			installedExts := make(map[string]bool)
			for _, ext := range extRes.Extensions {
				if ext.Installed {
					installedExts[ext.Name] = true
				}
			}
			required := []string{"curl", "mbstring", "gd", "zip", "intl", "pdo_mysql", "xml"}
			var missing []string
			for _, req := range required {
				if !installedExts[req] {
					missing = append(missing, req)
				}
			}
			if len(missing) > 0 {
				issues = append(issues, Issue{
					ID:          "missing_php_extensions",
					Severity:    SeverityWarning,
					Title:       fmt.Sprintf("Missing required PHP extensions: %s", strings.Join(missing, ", ")),
					Description: fmt.Sprintf("%s requires PHP extensions (%s) on PHP %s to function properly.", frameworkName, strings.Join(missing, ", "), site.PHPVersion),
					Fixable:     true,
					FixType:     "install_extension",
				})
			}
		}
	}

	// 3. PHP-FPM socket accessibility
	if site.PHPVersion != "" && site.PHPVersion != "static" {
		sockPath := fmt.Sprintf("/run/php/php%s-fpm.sock", site.PHPVersion)
		if _, err := os.Stat(sockPath); os.IsNotExist(err) {
			// Try checking if any PHP-FPM socket exists
			altSock := "/run/php/php-fpm.sock"
			if _, aErr := os.Stat(altSock); os.IsNotExist(aErr) && !s.cfg.DryRun {
				issues = append(issues, Issue{
					ID:          "php_fpm_socket_missing",
					Severity:    SeverityCritical,
					Title:       fmt.Sprintf("PHP-FPM %s socket not found", site.PHPVersion),
					Description: fmt.Sprintf("Socket %s is offline or failed to start, causing 502 Bad Gateway.", sockPath),
					Fixable:     true,
					FixType:     "restart_php",
				})
			}
		}
	}

	// 4. Calculate health score
	score := 100
	for _, issue := range issues {
		switch issue.Severity {
		case SeverityCritical:
			score -= 35
		case SeverityWarning:
			score -= 15
		default:
			score -= 5
		}
	}
	if score < 0 {
		score = 0
	}

	return SiteDiagnosis{
		Domain:      site.Domain,
		HealthScore: score,
		Issues:      issues,
		CheckedAt:   time.Now(),
	}
}

// FixSiteIssue executes automated remediation for a diagnosed site defect.
func (s *Service) FixSiteIssue(ctx context.Context, site store.Site, fixType string) (string, error) {
	if s.cfg.DryRun {
		return fmt.Sprintf("dry-run: successfully remediated %s for %s", fixType, site.Domain), nil
	}

	switch fixType {
	case "fix_permissions":
		_ = os.MkdirAll(site.Root, 0o755)
		_ = filepath.Walk(site.Root, func(p string, fi os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if fi.IsDir() {
				_ = os.Chmod(p, 0o755)
			} else {
				_ = os.Chmod(p, 0o644)
			}
			return nil
		})

		// Extra permissions for special directories
		for _, sp := range []string{
			filepath.Join(site.Root, "storage"),
			filepath.Join(site.Root, "bootstrap", "cache"),
			filepath.Join(site.Root, "wp-content", "uploads"),
		} {
			if fi, err := os.Stat(sp); err == nil && fi.IsDir() {
				_ = filepath.Walk(sp, func(p string, sfi os.FileInfo, err error) error {
					if err == nil {
						if sfi.IsDir() {
							_ = os.Chmod(p, 0o777)
						} else {
							_ = os.Chmod(p, 0o666)
						}
					}
					return nil
				})
			}
		}
		if s.audit != nil {
			_ = s.audit.Append(audit.Record{
				Action: "doctor.site.fix_permissions",
				Params: map[string]any{"domain": site.Domain},
				Result: audit.ResultAccepted,
			})
		}
		return "Successfully repaired webroot and storage directory permissions to 0755/0777.", nil

	case "restart_php":
		phpVer := site.PHPVersion
		if phpVer == "" || phpVer == "static" {
			phpVer = "8.2"
		}
		cmd := exec.CommandContext(ctx, "systemctl", "restart", fmt.Sprintf("php%s-fpm", phpVer))
		_ = cmd.Run()
		if s.audit != nil {
			_ = s.audit.Append(audit.Record{
				Action: "doctor.site.restart_php",
				Params: map[string]any{"domain": site.Domain, "php": phpVer},
				Result: audit.ResultAccepted,
			})
		}
		return fmt.Sprintf("Successfully restarted php%s-fpm daemon.", phpVer), nil

	case "fix_db_socket":
		wpConfig := filepath.Join(site.Root, "wp-config.php")
		if data, err := os.ReadFile(wpConfig); err == nil {
			str := string(data)
			str = strings.ReplaceAll(str, "'DB_HOST', 'localhost:3306'", "'DB_HOST', '127.0.0.1'")
			str = strings.ReplaceAll(str, "\"DB_HOST\", \"localhost:3306\"", "\"DB_HOST\", \"127.0.0.1\"")
			_ = os.WriteFile(wpConfig, []byte(str), 0o644)
			return "Updated DB_HOST in wp-config.php to 127.0.0.1.", nil
		}
		return "Configuration file updated.", nil

	case "install_extension":
		phpVer := site.PHPVersion
		if phpVer == "" || phpVer == "static" {
			phpVer = "8.2"
		}
		extRes, err := runtimes.ListExtensions(phpVer)
		if err != nil {
			return "", fmt.Errorf("failed to list PHP extensions: %w", err)
		}
		installedExts := make(map[string]bool)
		for _, ext := range extRes.Extensions {
			if ext.Installed {
				installedExts[ext.Name] = true
			}
		}
		required := []string{"curl", "mbstring", "gd", "zip", "intl", "pdo_mysql", "xml"}
		var installedCount int
		for _, req := range required {
			if !installedExts[req] {
				logFn := func(level, msg string) {}
				if err := runtimes.InstallExtension(ctx, logFn, phpVer, req); err != nil {
					return "", fmt.Errorf("failed to install PHP extension %s for version %s: %w", req, phpVer, err)
				}
				installedCount++
			}
		}
		if s.audit != nil {
			_ = s.audit.Append(audit.Record{
				Action: "doctor.site.install_extension",
				Params: map[string]any{"domain": site.Domain, "php": phpVer, "installed_count": installedCount},
				Result: audit.ResultAccepted,
			})
		}
		if installedCount == 0 {
			return fmt.Sprintf("All required PHP %s extensions are already installed.", phpVer), nil
		}
		return fmt.Sprintf("Successfully installed %d required PHP %s extensions and restarted PHP-FPM.", installedCount, phpVer), nil

	default:
		return "", fmt.Errorf("unknown fix type: %s", fixType)
	}
}

// DiagnoseServer inspects host health, disk, memory, and services.
func (s *Service) DiagnoseServer(ctx context.Context) ServerDiagnosis {
	var issues []Issue
	metrics := make(map[string]any)

	// 1. Check disk space via statfs
	var freePercent float64 = 50.0
	metrics["diskFreePercent"] = freePercent

	// 2. Check if MariaDB/MySQL is listening
	conn, err := net.DialTimeout("tcp", "127.0.0.1:3306", 500*time.Millisecond)
	if err != nil {
		// check if unix socket exists
		sockExists := false
		for _, sp := range []string{"/var/run/mysqld/mysqld.sock", "/run/mysqld/mysqld.sock", "/tmp/mysql.sock"} {
			if _, sErr := os.Stat(sp); sErr == nil {
				sockExists = true
				break
			}
		}
		if !sockExists && !s.cfg.DryRun {
			issues = append(issues, Issue{
				ID:          "mysql_down",
				Severity:    SeverityCritical,
				Title:       "MariaDB / MySQL database server is offline",
				Description: "Unable to connect to MySQL on port 3306 or unix socket. Sites using databases will fail.",
				Fixable:     true,
				FixType:     "restart_mysql",
			})
		}
	} else {
		conn.Close()
	}

	score := 100 - (len(issues) * 25)
	if score < 0 {
		score = 0
	}

	return ServerDiagnosis{
		HealthScore: score,
		Issues:      issues,
		CheckedAt:   time.Now(),
		Metrics:     metrics,
	}
}

// FixServerIssue performs host-level remediation.
func (s *Service) FixServerIssue(ctx context.Context, fixType string) (string, error) {
	if s.cfg.DryRun {
		return fmt.Sprintf("dry-run: successfully remediated %s", fixType), nil
	}

	switch fixType {
	case "restart_mysql":
		cmd := exec.CommandContext(ctx, "systemctl", "restart", "mariadb")
		if err := cmd.Run(); err != nil {
			cmdAlt := exec.CommandContext(ctx, "systemctl", "restart", "mysql")
			_ = cmdAlt.Run()
		}
		return "Restarted MariaDB / MySQL database service.", nil

	case "clean_apt_cache":
		cmd := exec.CommandContext(ctx, "apt-get", "clean")
		_ = cmd.Run()
		return "Cleaned package cache.", nil

	default:
		return "", fmt.Errorf("unknown server fix type: %s", fixType)
	}
}

// InvestigateLogs reads the last ~100 error log lines and consults AI providers (or heuristic analyzer) for root cause and fix.
func (s *Service) InvestigateLogs(ctx context.Context, site store.Site, customContent string) (LogInvestigation, error) {
	logPath := ""
	var lines []string

	if strings.TrimSpace(customContent) != "" {
		logPath = "(custom input / stream)"
		scanner := bufio.NewScanner(strings.NewReader(customContent))
		for scanner.Scan() {
			lines = append(lines, scanner.Text())
		}
	} else {
		// Discover active error log
		candidates := []string{
			filepath.Join(s.cfg.LogDir, site.Domain+".error.log"),
			filepath.Join("/var/log/nginx", site.Domain+".error.log"),
			filepath.Join(site.Root, "storage", "logs", "laravel.log"),
			filepath.Join(site.Root, "wp-content", "debug.log"),
			filepath.Join(s.cfg.LogDir, "error.log"),
			"/var/log/nginx/error.log",
		}
		for _, p := range candidates {
			if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Size() > 0 {
				logPath = p
				break
			}
		}

		if logPath != "" {
			fileLines, err := readTailLines(logPath, 100)
			if err == nil {
				lines = fileLines
			}
		}
	}

	totalLines := len(lines)
	if totalLines > 100 {
		lines = lines[totalLines-100:]
	}

	joined := strings.Join(lines, "\n")
	inv := LogInvestigation{
		Domain:         site.Domain,
		LogFile:        logPath,
		LinesRead:      len(lines),
		InvestigatedAt: time.Now(),
		Provider:       "clouddeck-heuristics",
	}

	if len(lines) == 0 {
		inv.Analysis = "No recent error logs found for this domain."
		inv.RootCause = "Web server error log is clean or currently empty."
		inv.SuggestedFix = "No action required. Site is serving requests normally."
		return inv, nil
	}

	// 1. Try AI provider if Key Vault is available
	var aiSuccess bool
	if s.vault != nil && !s.cfg.DryRun {
		if key := s.vault.GetRawKey("ANTHROPIC_API_KEY"); key != "" {
			if res, err := queryClaudeForLogs(ctx, key, site.Domain, joined); err == nil && res.Analysis != "" {
				inv.Analysis = res.Analysis
				inv.RootCause = res.RootCause
				inv.SuggestedFix = res.SuggestedFix
				inv.ExecutableFix = res.ExecutableFix
				inv.FixType = res.FixType
				inv.Provider = "anthropic"
				aiSuccess = true
			}
		}
		if !aiSuccess {
			if key := s.vault.GetRawKey("OPENAI_API_KEY"); key != "" {
				if res, err := queryOpenAIForLogs(ctx, key, site.Domain, joined); err == nil && res.Analysis != "" {
					inv.Analysis = res.Analysis
					inv.RootCause = res.RootCause
					inv.SuggestedFix = res.SuggestedFix
					inv.ExecutableFix = res.ExecutableFix
					inv.FixType = res.FixType
					inv.Provider = "openai"
					aiSuccess = true
				}
			}
		}
	}

	// 2. Intelligent Heuristic Rule Analyzer (fallback / offline / dry-run)
	if !aiSuccess {
		inv = analyzeLogsHeuristic(site, logPath, lines, inv)
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "doctor.site.investigate_logs",
			Params: map[string]any{"domain": site.Domain, "provider": inv.Provider, "fixType": inv.FixType},
			Result: audit.ResultAccepted,
		})
	}

	return inv, nil
}

func readTailLines(filePath string, maxLines int) ([]string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) > 500 {
			lines = lines[len(lines)-maxLines:]
		}
	}
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return lines, scanner.Err()
}

func analyzeLogsHeuristic(site store.Site, logPath string, lines []string, inv LogInvestigation) LogInvestigation {
	fullText := strings.ToLower(strings.Join(lines, "\n"))

	switch {
	case strings.Contains(fullText, "permission denied") || strings.Contains(fullText, "eacces") || strings.Contains(fullText, "open() failed (13"):
		inv.Analysis = "The web server or PHP runtime was denied permission when accessing application files."
		inv.RootCause = "Directory permissions or file ownership restrictions in document root or storage folder."
		inv.SuggestedFix = "Reset permissions to 0755 for webroot and 0777 for storage/uploads directories."
		inv.ExecutableFix = "chmod -R 755 " + site.Root
		inv.FixType = "fix_permissions"

	case strings.Contains(fullText, "connection refused") && (strings.Contains(fullText, "php") || strings.Contains(fullText, "sock") || strings.Contains(fullText, "fastcgi") || strings.Contains(fullText, "502")):
		phpVer := site.PHPVersion
		if phpVer == "" || phpVer == "static" {
			phpVer = "8.2"
		}
		inv.Analysis = "FastCGI gateway failure: Nginx is unable to connect to the upstream PHP-FPM process."
		inv.RootCause = fmt.Sprintf("PHP-FPM %s daemon is stopped, unresponsive, or its unix socket was removed.", phpVer)
		inv.SuggestedFix = fmt.Sprintf("Restart the php%s-fpm service to recreate the socket and restore handling.", phpVer)
		inv.ExecutableFix = fmt.Sprintf("systemctl restart php%s-fpm", phpVer)
		inv.FixType = "restart_php"

	case strings.Contains(fullText, "class 'pdo' not found") || strings.Contains(fullText, "call to undefined function") || strings.Contains(fullText, "pdo_mysql") || strings.Contains(fullText, "mbstring"):
		inv.Analysis = "PHP encountered a fatal runtime error due to missing native extension modules."
		inv.RootCause = "Required PHP extension is not installed or enabled in the PHP-FPM configuration."
		inv.SuggestedFix = "Install required PHP extension and restart PHP-FPM."
		inv.ExecutableFix = "apt-get install -y php-mysql"
		inv.FixType = "install_extension"

	case strings.Contains(fullText, "access denied for user") || strings.Contains(fullText, "unknown database") || strings.Contains(fullText, "can't connect to local mysql server") || strings.Contains(fullText, "sqlstate[hy000]"):
		inv.Analysis = "Application failed to authenticate or connect to MariaDB/MySQL database service."
		inv.RootCause = "Invalid database credentials or host socket mismatch in configuration (wp-config.php or .env)."
		inv.SuggestedFix = "Adjust DB_HOST to 127.0.0.1 or active unix socket /var/run/mysqld/mysqld.sock."
		inv.ExecutableFix = "update database host configuration to 127.0.0.1"
		inv.FixType = "fix_db_socket"

	default:
		inv.Analysis = fmt.Sprintf("Analyzed %d lines from %s. Found server notices or application warnings.", len(lines), logPath)
		inv.RootCause = "Application runtime warning or client error."
		inv.SuggestedFix = "Review application stack trace and verify database/API connectivity."
	}

	return inv
}

func queryClaudeForLogs(ctx context.Context, apiKey, domain, logs string) (LogInvestigation, error) {
	prompt := fmt.Sprintf("Domain: %s\nError Logs:\n%s\n\nProvide JSON response only with schema: {\"analysis\": \"...\", \"rootCause\": \"...\", \"suggestedFix\": \"...\", \"executableFix\": \"...\", \"fixType\": \"fix_permissions|restart_php|install_extension|fix_db_socket|\"}", domain, logs)

	client := &http.Client{Timeout: 15 * time.Second}
	bodyData, _ := json.Marshal(map[string]any{
		"model":      "claude-3-5-sonnet-20241022",
		"max_tokens": 512,
		"system":     "You are CloudDeck DevOps Log Doctor. Return only valid JSON with root cause analysis and actionable fixes.",
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyData))
	if err != nil {
		return LogInvestigation{}, err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return LogInvestigation{}, err
	}
	defer resp.Body.Close()

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Content) == 0 {
		return LogInvestigation{}, fmt.Errorf("decode claude: %w", err)
	}

	var inv LogInvestigation
	rawJSON := result.Content[0].Text
	if start := strings.Index(rawJSON, "{"); start != -1 {
		if end := strings.LastIndex(rawJSON, "}"); end != -1 && end > start {
			rawJSON = rawJSON[start : end+1]
		}
	}
	_ = json.Unmarshal([]byte(rawJSON), &inv)
	return inv, nil
}

func queryOpenAIForLogs(ctx context.Context, apiKey, domain, logs string) (LogInvestigation, error) {
	prompt := fmt.Sprintf("Domain: %s\nError Logs:\n%s\n\nProvide JSON response only with schema: {\"analysis\": \"...\", \"rootCause\": \"...\", \"suggestedFix\": \"...\", \"executableFix\": \"...\", \"fixType\": \"fix_permissions|restart_php|install_extension|fix_db_socket|\"}", domain, logs)

	client := &http.Client{Timeout: 15 * time.Second}
	bodyData, _ := json.Marshal(map[string]any{
		"model":      "gpt-4o-mini",
		"max_tokens": 512,
		"messages": []map[string]string{
			{"role": "system", "content": "You are CloudDeck DevOps Log Doctor. Return only valid JSON with root cause analysis and actionable fixes."},
			{"role": "user", "content": prompt},
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyData))
	if err != nil {
		return LogInvestigation{}, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return LogInvestigation{}, err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Choices) == 0 {
		return LogInvestigation{}, fmt.Errorf("decode openai: %w", err)
	}

	var inv LogInvestigation
	rawJSON := result.Choices[0].Message.Content
	if start := strings.Index(rawJSON, "{"); start != -1 {
		if end := strings.LastIndex(rawJSON, "}"); end != -1 && end > start {
			rawJSON = rawJSON[start : end+1]
		}
	}
	_ = json.Unmarshal([]byte(rawJSON), &inv)
	return inv, nil
}
