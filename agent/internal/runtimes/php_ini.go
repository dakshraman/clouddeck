package runtimes

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// Managed directives per specification:
// upload_max_filesize, post_max_size, memory_limit, max_execution_time, max_input_vars, display_errors, date.timezone

var KeyDirectives = []string{
	"upload_max_filesize",
	"post_max_size",
	"memory_limit",
	"max_execution_time",
	"max_input_vars",
	"display_errors",
	"date.timezone",
}

// DefaultDirectiveValues provides sensible defaults when not defined or empty.
var DefaultDirectiveValues = map[string]string{
	"upload_max_filesize": "64M",
	"post_max_size":       "64M",
	"memory_limit":        "256M",
	"max_execution_time":  "60",
	"max_input_vars":      "1000",
	"display_errors":      "Off",
	"date.timezone":       "UTC",
}

// PHPConfigResponse is returned by GET /v1/runtimes/php/config.
type PHPConfigResponse struct {
	Version    string            `json:"version"`
	Versions   []string          `json:"versions"`
	Path       string            `json:"path"`
	Directives map[string]string `json:"directives"`
}

// SetPHPConfigRequest is the payload for POST /v1/runtimes/php/config.
type SetPHPConfigRequest struct {
	Version    string            `json:"version"`
	Directives map[string]string `json:"directives"`
}

// SetPHPConfigResponse is returned on successful update.
type SetPHPConfigResponse struct {
	Success    bool              `json:"success"`
	Version    string            `json:"version"`
	Path       string            `json:"path"`
	Directives map[string]string `json:"directives"`
}

// FindPHPIniPath locates the php.ini configuration file for the requested version.
func FindPHPIniPath(version string) string {
	cleanVer := strings.ReplaceAll(version, ".", "")
	candidates := []string{
		filepath.Join("/etc/php", version, "fpm", "php.ini"),
		filepath.Join("/etc/php", version, "cli", "php.ini"),
		filepath.Join("/opt/homebrew/etc/php", version, "php.ini"),
		filepath.Join("/usr/local/etc/php", version, "php.ini"),
		filepath.Join("/www/server/php", cleanVer, "etc", "php.ini"),
	}

	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	// Canonical fallback path
	if runtime.GOOS == "darwin" {
		return filepath.Join("/opt/homebrew/etc/php", version, "php.ini")
	}
	return filepath.Join("/etc/php", version, "fpm", "php.ini")
}

// ReloadPHPFpm reloads the PHP-FPM service for a specific version.
func ReloadPHPFpm(version string) error {
	if runtime.GOOS == "darwin" {
		cmd := exec.Command("brew", "services", "restart", fmt.Sprintf("php@%s", version))
		if err := cmd.Run(); err != nil {
			_ = exec.Command("brew", "services", "restart", "php").Run()
		}
		return nil
	}

	unit := fmt.Sprintf("php%s-fpm", version)
	// Try systemctl reload first, then restart
	if err := exec.Command("systemctl", "reload", unit).Run(); err != nil {
		if err := exec.Command("systemctl", "restart", unit).Run(); err != nil {
			// Fallback to generic php-fpm
			_ = exec.Command("systemctl", "reload", "php-fpm").Run()
		}
	}
	return nil
}

// RestartPHPFpm restarts the PHP-FPM service for a specific version.
func RestartPHPFpm(version string) error {
	if runtime.GOOS == "darwin" {
		cmd := exec.Command("brew", "services", "restart", fmt.Sprintf("php@%s", version))
		if err := cmd.Run(); err != nil {
			_ = exec.Command("brew", "services", "restart", "php").Run()
		}
		return nil
	}

	unit := fmt.Sprintf("php%s-fpm", version)
	if err := exec.Command("systemctl", "restart", unit).Run(); err != nil {
		_ = exec.Command("systemctl", "restart", "php-fpm").Run()
	}
	return nil
}

// GetPHPConfig parses php.ini and returns the current values of key directives.
func GetPHPConfig(version string) (PHPConfigResponse, error) {
	if version == "" {
		version = DefaultPHPVersion()
	} else if !phpVersionRe.MatchString(version) {
		return PHPConfigResponse{}, apierr.BadRequest("invalid_version", fmt.Sprintf("invalid PHP version: %s", version))
	}

	iniPath := FindPHPIniPath(version)
	directives := make(map[string]string)
	for k, v := range DefaultDirectiveValues {
		directives[k] = v
	}

	content, err := os.ReadFile(iniPath)
	if err == nil {
		readDirectivesFromContent(string(content), directives)
	}

	return PHPConfigResponse{
		Version:    version,
		Versions:   SupportedPHPVersions(),
		Path:       iniPath,
		Directives: directives,
	}, nil
}

func readDirectivesFromContent(content string, out map[string]string) {
	lines := strings.Split(content, "\n")
	seenActive := make(map[string]bool)

	for _, key := range KeyDirectives {
		pattern := regexp.MustCompile(`(?i)^([;\s]*)(` + regexp.QuoteMeta(key) + `)\s*=\s*(.*)$`)
		for _, line := range lines {
			m := pattern.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			prefix := m[1]
			val := strings.TrimSpace(m[3])
			// Strip inline comments if present: e.g. "val ; comment"
			if idx := strings.Index(val, ";"); idx != -1 {
				val = strings.TrimSpace(val[:idx])
			}
			// Strip surrounding quotes
			val = strings.Trim(val, `"'`)

			isCommented := strings.Contains(prefix, ";")
			if !isCommented {
				out[key] = val
				seenActive[key] = true
			} else if !seenActive[key] && val != "" {
				// Remember commented default if non-empty and no active line seen yet
				out[key] = val
			}
		}
	}
}

var (
	sizeRegex = regexp.MustCompile(`^(?:-1|[0-9]+[KMGkmg]?)$`)
	numRegex  = regexp.MustCompile(`^[0-9]+$`)
	tzRegex   = regexp.MustCompile(`^[A-Za-z0-9_+\-/]+$`)
)

func validateDirective(key, val string) (string, error) {
	val = strings.TrimSpace(val)
	switch key {
	case "upload_max_filesize", "post_max_size":
		if !sizeRegex.MatchString(val) {
			return "", apierr.BadRequest("invalid_directive_value", fmt.Sprintf("invalid size for %s: %s (example: 64M, 128M, 1G)", key, val))
		}
		return strings.ToUpper(val), nil
	case "memory_limit":
		if !sizeRegex.MatchString(val) {
			return "", apierr.BadRequest("invalid_directive_value", fmt.Sprintf("invalid size for %s: %s (example: 256M, 512M, -1)", key, val))
		}
		return strings.ToUpper(val), nil
	case "max_execution_time", "max_input_vars":
		if !numRegex.MatchString(val) {
			return "", apierr.BadRequest("invalid_directive_value", fmt.Sprintf("invalid integer for %s: %s", key, val))
		}
		return val, nil
	case "display_errors":
		lower := strings.ToLower(val)
		if lower == "on" || lower == "1" || lower == "true" {
			return "On", nil
		} else if lower == "off" || lower == "0" || lower == "false" {
			return "Off", nil
		}
		return "", apierr.BadRequest("invalid_directive_value", fmt.Sprintf("invalid boolean for display_errors: %s (expected On or Off)", val))
	case "date.timezone":
		if !tzRegex.MatchString(val) {
			return "", apierr.BadRequest("invalid_directive_value", fmt.Sprintf("invalid timezone: %s (example: UTC, America/New_York)", val))
		}
		return val, nil
	default:
		return "", apierr.BadRequest("unknown_directive", fmt.Sprintf("unsupported directive: %s", key))
	}
}

// SetPHPConfig validates, updates php.ini safely, and reloads PHP-FPM.
func SetPHPConfig(req SetPHPConfigRequest) (SetPHPConfigResponse, error) {
	if req.Version == "" {
		req.Version = DefaultPHPVersion()
	} else if !phpVersionRe.MatchString(req.Version) {
		return SetPHPConfigResponse{}, apierr.BadRequest("invalid_version", fmt.Sprintf("invalid PHP version: %s", req.Version))
	}

	if len(req.Directives) == 0 {
		return SetPHPConfigResponse{}, apierr.BadRequest("missing_directives", "no directives provided to update")
	}

	normalized := make(map[string]string)
	for k, v := range req.Directives {
		normVal, err := validateDirective(k, v)
		if err != nil {
			return SetPHPConfigResponse{}, err
		}
		normalized[k] = normVal
	}

	iniPath := FindPHPIniPath(req.Version)
	dir := filepath.Dir(iniPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return SetPHPConfigResponse{}, fmt.Errorf("failed to create config directory %s: %w", dir, err)
	}

	existingContent := ""
	if data, err := os.ReadFile(iniPath); err == nil {
		existingContent = string(data)
	}

	newContent := updateIniDirectives(existingContent, normalized)

	// Write atomically to temporary file first
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	tmpPath := filepath.Join(dir, fmt.Sprintf(".php.ini.tmp-%s", hex.EncodeToString(b)))
	if err := os.WriteFile(tmpPath, []byte(newContent), 0o644); err != nil {
		return SetPHPConfigResponse{}, fmt.Errorf("failed to write temporary php.ini: %w", err)
	}
	if err := os.Rename(tmpPath, iniPath); err != nil {
		_ = os.Remove(tmpPath)
		return SetPHPConfigResponse{}, fmt.Errorf("failed to replace php.ini: %w", err)
	}

	// Reload PHP-FPM to apply changes
	_ = ReloadPHPFpm(req.Version)

	// Fetch full resulting configuration
	cfgRes, err := GetPHPConfig(req.Version)
	if err != nil {
		return SetPHPConfigResponse{
			Success:    true,
			Version:    req.Version,
			Path:       iniPath,
			Directives: normalized,
		}, nil
	}

	return SetPHPConfigResponse{
		Success:    true,
		Version:    req.Version,
		Path:       iniPath,
		Directives: cfgRes.Directives,
	}, nil
}

func updateIniDirectives(content string, updates map[string]string) string {
	if content == "" {
		content = "[PHP]\n"
	}

	lines := strings.Split(content, "\n")
	updatedKeys := make(map[string]bool)

	for key, val := range updates {
		activePattern := regexp.MustCompile(`(?i)^\s*` + regexp.QuoteMeta(key) + `\s*=`)
		commentPattern := regexp.MustCompile(`(?i)^\s*;\s*` + regexp.QuoteMeta(key) + `\s*=`)

		replaced := false
		// First pass: replace uncommented/active match
		for i, line := range lines {
			if activePattern.MatchString(line) {
				lines[i] = fmt.Sprintf("%s = %s", key, val)
				replaced = true
				updatedKeys[key] = true
				break
			}
		}

		// Second pass: replace commented match if no active line was found
		if !replaced {
			for i, line := range lines {
				if commentPattern.MatchString(line) {
					lines[i] = fmt.Sprintf("%s = %s", key, val)
					replaced = true
					updatedKeys[key] = true
					break
				}
			}
		}
	}

	// For keys not found anywhere, append them under [PHP] or at end
	var appended []string
	for key, val := range updates {
		if !updatedKeys[key] {
			appended = append(appended, fmt.Sprintf("%s = %s", key, val))
		}
	}

	if len(appended) > 0 {
		phpSectionIdx := -1
		for i, line := range lines {
			if strings.TrimSpace(line) == "[PHP]" {
				phpSectionIdx = i
				break
			}
		}

		if phpSectionIdx != -1 {
			// Insert after [PHP] header
			tail := append([]string{}, lines[phpSectionIdx+1:]...)
			lines = append(lines[:phpSectionIdx+1], appended...)
			lines = append(lines, tail...)
		} else {
			lines = append(lines, appended...)
		}
	}

	return strings.Join(lines, "\n")
}
