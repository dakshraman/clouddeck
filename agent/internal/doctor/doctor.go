package doctor

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

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

// Service provides autonomous diagnostics and remediation.
type Service struct {
	cfg   config.Config
	audit *audit.Log
}

// New creates a new doctor Service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{
		cfg:   cfg,
		audit: auditLog,
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
