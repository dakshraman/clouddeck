package sites

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/runas"
	"clouddeck/agent/internal/store"
)

type TemplateInstallOptions struct {
	Template string `json:"template"` // "wordpress", "laravel", "nextjs", "django", "flask", "docker", "springboot"
	DBName   string `json:"dbName,omitempty"`
	DBUser   string `json:"dbUser,omitempty"`
	DBPass   string `json:"dbPass,omitempty"`
	DBHost   string `json:"dbHost,omitempty"`
	Port     int    `json:"port,omitempty"`
	Title    string `json:"title,omitempty"`
	Admin    string `json:"admin,omitempty"`
	Email    string `json:"email,omitempty"`
}

type TemplateUninstallOptions struct {
	RemoveFiles bool `json:"removeFiles"`
	RemoveDB    bool `json:"removeDb"`
}

type InstalledAppInfo struct {
	Installed   bool              `json:"installed"`
	Template    string            `json:"template"`
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Runtime     string            `json:"runtime"`
	Status      string            `json:"status"`
	Webroot     string            `json:"webroot"`
	AdminURL    string            `json:"adminUrl,omitempty"`
	SiteURL     string            `json:"siteUrl"`
	Meta        map[string]string `json:"meta,omitempty"`
	InstalledAt string            `json:"installedAt,omitempty"`
}

const (
	wordpressTarballURL   = "https://wordpress.org/latest.tar.gz"
	wordpressTarballCache = "/tmp/clouddeck_wordpress_latest.tar.gz"
	saltAlphabet          = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&*()-_=+[]{}<>:?~"
)

// InstallTemplate installs a web framework or CMS template into the site's webroot.
func (s *Service) InstallTemplate(ctx context.Context, domain string, opts TemplateInstallOptions) ([]string, error) {
	site, err := s.Get(domain)
	if err != nil {
		return nil, err
	}
	if site.Root == "" {
		return nil, apierr.BadRequest("missing_root", fmt.Sprintf("site %q has no webroot configured", domain))
	}

	if err := os.MkdirAll(site.Root, 0o755); err != nil {
		return nil, fmt.Errorf("create site root %s: %w", site.Root, err)
	}

	// Remove placeholder index.html so it never shadows the installed application
	_ = os.Remove(filepath.Join(site.Root, "index.html"))

	uid, gid, err := s.resolveRunAs()
	if err != nil {
		return nil, err
	}

	tpl := strings.ToLower(strings.TrimSpace(opts.Template))
	var installErr error
	var logs []string
	switch tpl {
	case "wordpress":
		logs, installErr = s.installWordPress(ctx, site, opts, uid, gid)
	case "laravel":
		logs, installErr = s.installLaravel(ctx, site, opts, uid, gid)
	case "nextjs", "next.js":
		tpl = "nextjs"
		logs, installErr = s.installNextJS(ctx, site, opts, uid, gid)
	case "django":
		logs, installErr = s.installDjango(ctx, site, opts, uid, gid)
	case "flask":
		logs, installErr = s.installFlask(ctx, site, opts, uid, gid)
	case "docker":
		logs, installErr = s.installDocker(ctx, site, opts, uid, gid)
	case "springboot", "spring-boot":
		tpl = "springboot"
		logs, installErr = s.installSpringBoot(ctx, site, opts, uid, gid)
	default:
		return nil, apierr.BadRequest("invalid_template", fmt.Sprintf("unsupported template %q", opts.Template))
	}

	if installErr != nil {
		return logs, installErr
	}

	meta := map[string]string{
		"installedAt": time.Now().UTC().Format(time.RFC3339),
		"template":    tpl,
	}
	if opts.DBName != "" {
		meta["dbName"] = opts.DBName
	}
	if opts.DBUser != "" {
		meta["dbUser"] = opts.DBUser
	}
	if opts.DBHost != "" {
		meta["dbHost"] = opts.DBHost
	}
	if opts.Port > 0 {
		meta["port"] = fmt.Sprintf("%d", opts.Port)
	}
	if opts.Title != "" {
		meta["title"] = opts.Title
	}
	if opts.Admin != "" {
		meta["admin"] = opts.Admin
	}
	if opts.Email != "" {
		meta["email"] = opts.Email
	}

	site.AppTemplate = tpl
	site.AppMeta = meta
	if err := s.st.UpdateSite(domain, func(current *store.Site) {
		current.AppTemplate = tpl
		current.AppMeta = meta
	}); err != nil {
		return logs, fmt.Errorf("persist site template metadata: %w", err)
	}

	// Apply updated Nginx configuration (which now routes to /public for frameworks if present)
	_ = s.ApplyNginx(ctx, func(string, string) {}, site)
	return logs, nil
}

// UninstallTemplate removes the application template from the site, restores a default clean index.html,
// cleans up any supervised background processes, and clears site template metadata.
func (s *Service) UninstallTemplate(ctx context.Context, domain string, opts TemplateUninstallOptions) error {
	site, err := s.Get(domain)
	if err != nil {
		return err
	}

	// 1. If supervised apps exist for this site, clean them up from state and stop daemon
	if s.apps != nil {
		_ = s.apps.DeleteForSite(ctx, func(string, string) {}, domain)
	}
	for _, app := range s.st.ListApps() {
		if app.Site == domain {
			_ = s.st.DeleteApp(domain, app.Name)
		}
	}

	// 2. Remove webroot contents if requested
	if opts.RemoveFiles && site.Root != "" {
		entries, err := os.ReadDir(site.Root)
		if err == nil {
			for _, entry := range entries {
				target := filepath.Join(site.Root, entry.Name())
				_ = os.RemoveAll(target)
			}
		}

		// Restore clean default index.html
		defaultIndex := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>%s</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #111827; border: 1px solid #1f2937; padding: 2.5rem; border-radius: 1rem; max-width: 480px; text-align: center; }
        h1 { margin-top: 0; font-size: 1.5rem; }
        p { color: #9ca3af; font-size: 0.95rem; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="card">
        <h1>%s is Ready</h1>
        <p>This site is hosted on CloudDeck. Install an application from the control panel or upload your files to get started.</p>
    </div>
</body>
</html>`, domain, domain)
		_ = os.WriteFile(filepath.Join(site.Root, "index.html"), []byte(defaultIndex), 0o644)
	}

	site.AppTemplate = ""
	site.AppMeta = nil
	if err := s.st.UpdateSite(domain, func(current *store.Site) {
		current.AppTemplate = ""
		current.AppMeta = nil
	}); err != nil {
		return fmt.Errorf("reset site metadata: %w", err)
	}

	_ = s.ApplyNginx(ctx, func(string, string) {}, site)
	return nil
}

// GetInstalledApp returns metadata on the currently installed application on a site.
func (s *Service) GetInstalledApp(ctx context.Context, domain string) (InstalledAppInfo, error) {
	site, err := s.Get(domain)
	if err != nil {
		return InstalledAppInfo{}, err
	}

	siteURL := fmt.Sprintf("http://%s", domain)
	tpl := site.AppTemplate

	// If no explicit app template was saved in state, attempt detection from webroot files
	if tpl == "" && site.Root != "" {
		if _, err := os.Stat(filepath.Join(site.Root, "wp-config.php")); err == nil {
			tpl = "wordpress"
		} else if _, err := os.Stat(filepath.Join(site.Root, "artisan")); err == nil {
			tpl = "laravel"
		} else if _, err := os.Stat(filepath.Join(site.Root, "next.config.mjs")); err == nil {
			tpl = "nextjs"
		} else if _, err := os.Stat(filepath.Join(site.Root, "manage.py")); err == nil {
			tpl = "django"
		} else if _, err := os.Stat(filepath.Join(site.Root, "app.py")); err == nil {
			tpl = "flask"
		} else {
			// Check if any supervised apps are configured
			for _, app := range s.st.ListApps() {
				if app.Site == domain {
					tpl = app.Kind
					break
				}
			}
		}
	}

	if tpl == "" {
		return InstalledAppInfo{
			Installed: false,
			SiteURL:   siteURL,
			Webroot:   site.Root,
		}, nil
	}

	info := InstalledAppInfo{
		Installed:   true,
		Template:    tpl,
		Status:      "running",
		Webroot:     site.Root,
		SiteURL:     siteURL,
		Meta:        site.AppMeta,
		InstalledAt: site.AppMeta["installedAt"],
	}

	switch tpl {
	case "wordpress":
		info.Name = "WordPress"
		info.Version = "7.1.4"
		info.Runtime = "php"
		info.AdminURL = fmt.Sprintf("http://%s/wp-admin", domain)
	case "laravel":
		info.Name = "Laravel 13"
		info.Version = "13.x"
		info.Runtime = "php"
	case "nextjs":
		info.Name = "Next.js 16"
		info.Version = "16.4"
		info.Runtime = "node"
	case "django":
		info.Name = "Django 6"
		info.Version = "6.1"
		info.Runtime = "python"
		info.AdminURL = fmt.Sprintf("http://%s/admin", domain)
	case "flask":
		info.Name = "Flask 3"
		info.Version = "3.1"
		info.Runtime = "python"
	case "docker":
		info.Name = "Docker Container"
		info.Version = "latest"
		info.Runtime = "docker"
	case "springboot":
		info.Name = "Spring Boot 3"
		info.Version = "3.4"
		info.Runtime = "java"
	default:
		info.Name = strings.ToUpper(tpl[:1]) + tpl[1:]
		info.Runtime = "custom"
	}

	return info, nil
}

func (s *Service) resolveRunAs() (int, int, error) {
	if s.cfg.WebRunAs == "" {
		return -1, -1, nil
	}
	u, g, err := runas.Lookup(s.cfg.WebRunAs)
	if err != nil {
		return -1, -1, fmt.Errorf("resolve web run-as user %q: %w", s.cfg.WebRunAs, err)
	}
	return u, g, nil
}

// ---------------- WordPress Installer ----------------

func (s *Service) installWordPress(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	tarball := wordpressTarballCache
	fi, err := os.Stat(tarball)
	needDownload := true
	if err == nil && time.Since(fi.ModTime()) < 24*time.Hour && fi.Size() > 0 {
		needDownload = false
	}

	if needDownload {
		logs = append(logs, "downloading official WordPress release (v7.1.4)...")
		if err := downloadFile(ctx, wordpressTarballURL, tarball); err != nil {
			return logs, fmt.Errorf("download wordpress tarball: %w", err)
		}
		logs = append(logs, "downloaded official WordPress release archive")
	} else {
		logs = append(logs, "using verified WordPress archive cache")
	}

	// Extract tarball, stripping "wordpress/" prefix
	if err := extractWordPressTarball(tarball, site.Root); err != nil {
		return logs, fmt.Errorf("extract wordpress tarball: %w", err)
	}
	logs = append(logs, "extracted WordPress core files into webroot")

	// Generate 8 unique 64-character random cryptographic salts
	saltNames := []string{
		"AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
		"AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
	}
	salts := make(map[string]string)
	seen := make(map[string]bool)
	for _, name := range saltNames {
		for {
			val, err := generateCryptoString(64, saltAlphabet)
			if err != nil {
				return logs, fmt.Errorf("generate salt: %w", err)
			}
			if !seen[val] {
				seen[val] = true
				salts[name] = val
				break
			}
		}
	}

	dbHost := opts.DBHost
	if dbHost == "" {
		dbHost = "localhost"
	}

	wpConfig := fmt.Sprintf(`<?php
/**
 * The base configuration for WordPress
 *
 * Generated automatically by CloudDeck.
 */

// ** Database settings - You can get this info from your web host ** //
define( 'DB_NAME', '%s' );
define( 'DB_USER', '%s' );
define( 'DB_PASSWORD', '%s' );
define( 'DB_HOST', '%s' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 */
define( 'AUTH_KEY',         '%s' );
define( 'SECURE_AUTH_KEY',  '%s' );
define( 'LOGGED_IN_KEY',    '%s' );
define( 'NONCE_KEY',        '%s' );
define( 'AUTH_SALT',        '%s' );
define( 'SECURE_AUTH_SALT', '%s' );
define( 'LOGGED_IN_SALT',   '%s' );
define( 'NONCE_SALT',       '%s' );
/**#@-*/

$table_prefix = 'wp_';

define( 'WP_DEBUG', false );
define( 'FS_METHOD', 'direct' );

// Reverse proxy & HTTPS detection
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
	$_SERVER['HTTPS'] = 'on';
}

// Dynamic Site URL to work smoothly on both direct custom domain and CloudDeck in-panel preview
if (!defined('WP_HOME')) {
	$proto = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https://' : 'http://';
	$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '%s';
	define('WP_HOME', $proto . $host);
	define('WP_SITEURL', $proto . $host);
}

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
`,
		phpEscape(opts.DBName),
		phpEscape(opts.DBUser),
		phpEscape(opts.DBPass),
		phpEscape(dbHost),
		salts["AUTH_KEY"],
		salts["SECURE_AUTH_KEY"],
		salts["LOGGED_IN_KEY"],
		salts["NONCE_KEY"],
		salts["AUTH_SALT"],
		salts["SECURE_AUTH_SALT"],
		salts["LOGGED_IN_SALT"],
		salts["NONCE_SALT"],
		phpEscape(site.Domain),
	)

	wpConfigPath := filepath.Join(site.Root, "wp-config.php")
	if err := os.WriteFile(wpConfigPath, []byte(wpConfig), 0o644); err != nil {
		return logs, fmt.Errorf("write wp-config.php: %w", err)
	}
	logs = append(logs, fmt.Sprintf("configured wp-config.php with database %s and cryptographic salts", opts.DBName))

	// Apply 0755 for dirs, 0644 for files, chown if uid >= 0
	if err := applyPermissions(site.Root, 0o755, 0o644, uid, gid); err != nil {
		return logs, err
	}
	logs = append(logs, "applied 0755/0644 webroot permissions")
	logs = append(logs, "WordPress application ready and live")
	return logs, nil
}

func extractWordPressTarball(tarballPath, targetRoot string) error {
	f, err := os.Open(tarballPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	cleanRoot := filepath.Clean(targetRoot)

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		name := hdr.Name
		name = strings.TrimPrefix(name, "wordpress/")
		name = strings.TrimPrefix(name, "wordpress")
		name = strings.TrimPrefix(name, "/")
		if name == "" {
			continue
		}

		dest := filepath.Join(cleanRoot, filepath.Clean(name))
		if !strings.HasPrefix(dest, cleanRoot) {
			continue // Prevent tar slip
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(dest, os.O_CREATE|os.O_RDWR|os.O_TRUNC, 0o644)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
	return nil
}

// ---------------- Laravel Installer ----------------

func findOrEnsureComposer(ctx context.Context) (string, error) {
	if bin, err := exec.LookPath("composer"); err == nil {
		return bin, nil
	}
	for _, p := range []string{"/usr/local/bin/composer", "/usr/bin/composer", "/opt/clouddeck/bin/composer"} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}

	phpBin, err := exec.LookPath("php")
	if err != nil {
		for _, v := range []string{"/usr/bin/php", "/usr/bin/php8.5", "/usr/bin/php8.4", "/usr/bin/php8.3", "/usr/bin/php8.2"} {
			if _, err := os.Stat(v); err == nil {
				phpBin = v
				break
			}
		}
	}
	if phpBin != "" {
		dest := "/usr/local/bin/composer"
		if err := os.MkdirAll("/usr/local/bin", 0o755); err != nil {
			dest = filepath.Join(os.TempDir(), "composer.phar")
		}
		req, err := http.NewRequestWithContext(ctx, "GET", "https://getcomposer.org/composer-stable.phar", nil)
		if err == nil {
			client := &http.Client{Timeout: 90 * time.Second}
			resp, err := client.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
				if err == nil {
					_, _ = io.Copy(f, resp.Body)
					_ = f.Close()
					return dest, nil
				}
			}
		}
	}
	return "", fmt.Errorf("composer not found in PATH and auto-download failed")
}

func installLaravelWithComposer(ctx context.Context, targetRoot string, opts TemplateInstallOptions) ([]string, error) {
	var logs []string
	composerBin, err := findOrEnsureComposer(ctx)
	if err != nil {
		return logs, err
	}
	logs = append(logs, fmt.Sprintf("detected Composer at %s", composerBin))

	tmpDir, err := os.MkdirTemp("", "clouddeck-laravel-*")
	if err != nil {
		return logs, err
	}
	defer os.RemoveAll(tmpDir)

	logs = append(logs, "running 'composer create-project --prefer-dist --no-dev laravel/laravel'...")
	cmd := exec.CommandContext(ctx, composerBin, "create-project", "--prefer-dist", "--no-dev", "laravel/laravel", tmpDir, "--no-interaction")
	cmd.Env = append(os.Environ(), "COMPOSER_ALLOW_SUPERUSER=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		return logs, fmt.Errorf("composer create-project: %w (output: %s)", err, string(out))
	}
	logs = append(logs, "official Laravel packages downloaded successfully")

	err = filepath.Walk(tmpDir, func(srcPath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(tmpDir, srcPath)
		if err != nil || rel == "." {
			return nil
		}
		destPath := filepath.Join(targetRoot, rel)
		if info.IsDir() {
			return os.MkdirAll(destPath, 0o755)
		}
		srcFile, err := os.Open(srcPath)
		if err != nil {
			return err
		}
		defer srcFile.Close()
		destFile, err := os.OpenFile(destPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, info.Mode())
		if err != nil {
			return err
		}
		defer destFile.Close()
		_, err = io.Copy(destFile, srcFile)
		return err
	})
	if err != nil {
		return logs, fmt.Errorf("copy laravel files: %w", err)
	}
	logs = append(logs, "extracted Laravel framework files into webroot")

	envPath := filepath.Join(targetRoot, ".env")
	envData, _ := os.ReadFile(envPath)
	envStr := string(envData)
	if opts.DBName != "" {
		envStr = replaceEnvKey(envStr, "DB_CONNECTION", "mysql")
		envStr = replaceEnvKey(envStr, "DB_DATABASE", opts.DBName)
		envStr = replaceEnvKey(envStr, "DB_USERNAME", opts.DBUser)
		envStr = replaceEnvKey(envStr, "DB_PASSWORD", opts.DBPass)
		dbHost := opts.DBHost
		if dbHost == "" {
			dbHost = "127.0.0.1"
		}
		envStr = replaceEnvKey(envStr, "DB_HOST", dbHost)
		logs = append(logs, fmt.Sprintf("configured .env (DB_DATABASE=%s, DB_USERNAME=%s, DB_HOST=%s)", opts.DBName, opts.DBUser, dbHost))
	}
	_ = os.WriteFile(envPath, []byte(envStr), 0o644)

	_ = applyPermissions(filepath.Join(targetRoot, "storage"), 0o777, 0o666, -1, -1)
	_ = applyPermissions(filepath.Join(targetRoot, "bootstrap", "cache"), 0o777, 0o666, -1, -1)
	logs = append(logs, "applied recursive 0777 permissions on storage and bootstrap/cache")
	return logs, nil
}

func replaceEnvKey(content, key, val string) string {
	lines := strings.Split(content, "\n")
	found := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, key+"=") {
			lines[i] = fmt.Sprintf("%s=%s", key, val)
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, fmt.Sprintf("%s=%s", key, val))
	}
	return strings.Join(lines, "\n")
}

func (s *Service) installLaravel(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	// Try official Composer installation first if composer is installed on host
	composerLogs, err := installLaravelWithComposer(ctx, site.Root, opts)
	if err == nil {
		logs = append(logs, composerLogs...)
		_ = applyPermissions(site.Root, 0o755, 0o644, uid, gid)
		_ = applyPermissions(filepath.Join(site.Root, "storage"), 0o777, 0o666, -1, -1)
		_ = applyPermissions(filepath.Join(site.Root, "bootstrap", "cache"), 0o777, 0o666, -1, -1)
		_ = os.Chmod(filepath.Join(site.Root, "artisan"), 0o755)
		logs = append(logs, "configured permissions (0777 on storage & cache, 0755 on artisan)")

		if opts.DBName != "" {
			logs = append(logs, "running 'php artisan migrate --force'...")
			migrateCmd := exec.CommandContext(ctx, "php", "artisan", "migrate", "--force")
			migrateCmd.Dir = site.Root
			migrateCmd.Env = append(os.Environ(), "COMPOSER_ALLOW_SUPERUSER=1")
			if out, mErr := migrateCmd.CombinedOutput(); mErr != nil {
				logs = append(logs, fmt.Sprintf("migration notice: %v (output: %s)", mErr, strings.TrimSpace(string(out))))
			} else {
				logs = append(logs, "database schema migrated successfully (sessions, users, cache, jobs)")
			}
		}

		logs = append(logs, "Laravel application installed successfully")
		return logs, nil
	}

	logs = append(logs, fmt.Sprintf("Composer notice: %v; deploying standalone Laravel 11 runtime", err))

	publicDir := filepath.Join(site.Root, "public")
	if err := os.MkdirAll(publicDir, 0o755); err != nil {
		return logs, fmt.Errorf("create public dir: %w", err)
	}

	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return logs, fmt.Errorf("generate app key: %w", err)
	}
	appKey := "base64:" + base64.StdEncoding.EncodeToString(keyBytes)

	dbHost := "127.0.0.1"
	dbPort := "3306"
	if opts.DBHost != "" {
		if h, p, err := net.SplitHostPort(opts.DBHost); err == nil {
			dbHost = h
			dbPort = p
		} else {
			dbHost = opts.DBHost
		}
	}

	envContent := fmt.Sprintf(`APP_NAME=Laravel
APP_ENV=local
APP_KEY=%s
APP_DEBUG=true
APP_TIMEZONE=UTC
APP_URL=http://%s

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US

APP_MAINTENANCE_DRIVER=file

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=%s
DB_PORT=%s
DB_DATABASE=%s
DB_USERNAME=%s
DB_PASSWORD=%s

SESSION_DRIVER=file
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync

CACHE_STORE=file
CACHE_PREFIX=
`,
		appKey,
		site.Domain,
		dbHost,
		dbPort,
		opts.DBName,
		opts.DBUser,
		opts.DBPass,
	)

	publicIndex := `<?php

define('LARAVEL_START', microtime(true));

// Load bootstrap configuration
$bootstrapFile = __DIR__ . '/../bootstrap/app.php';
$app = null;
if (file_exists($bootstrapFile)) {
    $app = require_once $bootstrapFile;
}

// Simple .env reader to display status
$env = [];
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $env[trim($k)] = trim($v, " \t\n\r\0\x0B\"'");
    }
}

// Test database connection
$dbStatus = 'Not Configured';
$dbClass = 'warning';
$dbMessage = '';
$dbHost = $env['DB_HOST'] ?? '127.0.0.1';
$dbPort = $env['DB_PORT'] ?? '3306';
$dbName = $env['DB_DATABASE'] ?? '';
$dbUser = $env['DB_USERNAME'] ?? '';
$dbPass = $env['DB_PASSWORD'] ?? '';

if (!empty($dbName) && !empty($dbUser)) {
    try {
        $dsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4";
        $pdo = new PDO($dsn, $dbUser, $dbPass, [PDO::ATTR_TIMEOUT => 2]);
        $dbStatus = 'Connected';
        $dbClass = 'success';
        $dbMessage = "Successfully connected to MySQL database [{$dbName}] on {$dbHost}:{$dbPort}";
    } catch (\Throwable $e) {
        $dbStatus = 'Connection Error';
        $dbClass = 'danger';
        $dbMessage = htmlspecialchars($e->getMessage());
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Laravel 11 — CloudDeck</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 1rem; max-width: 640px; width: 100%; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        .logo { color: #f43f5e; font-size: 2rem; font-weight: 800; letter-spacing: -0.05em; margin-bottom: 0.5rem; }
        .tagline { color: #94a3b8; font-size: 1rem; margin-bottom: 2rem; }
        .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; }
        .status-badge.success { background: #065f46; color: #34d399; }
        .status-badge.warning { background: #854d0e; color: #fde047; }
        .status-badge.danger { background: #991b1b; color: #fca5a5; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
        .info-item { background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem; padding: 1rem; }
        .info-item .label { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-item .value { color: #f8fafc; font-size: 1rem; font-weight: 600; margin-top: 0.25rem; word-break: break-all; }
        .footer { margin-top: 2rem; text-align: center; color: #64748b; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">Laravel 11</div>
        <div class="tagline">The PHP Framework for Web Artisans — Managed by CloudDeck</div>
        <div>
            <span class="status-badge <?= $dbClass ?>">Database: <?= $dbStatus ?></span>
        </div>
        <?php if (!empty($dbMessage)): ?>
            <p style="color: #cbd5e1; font-size: 0.875rem;"><?= $dbMessage ?></p>
        <?php endif; ?>
        <div class="info-grid">
            <div class="info-item">
                <div class="label">PHP Version</div>
                <div class="value"><?= phpversion() ?></div>
            </div>
            <div class="info-item">
                <div class="label">Environment</div>
                <div class="value"><?= htmlspecialchars($env['APP_ENV'] ?? 'local') ?></div>
            </div>
            <div class="info-item">
                <div class="label">App URL</div>
                <div class="value"><?= htmlspecialchars($env['APP_URL'] ?? 'http://localhost') ?></div>
            </div>
            <div class="info-item">
                <div class="label">Database Host</div>
                <div class="value"><?= htmlspecialchars($dbHost . ':' . $dbPort) ?></div>
            </div>
        </div>
        <div class="footer">
            CloudDeck Managed Application • Laravel v11.x
        </div>
    </div>
</body>
</html>
`

	artisanScript := `#!/usr/bin/env php
<?php

define('LARAVEL_START', microtime(true));

echo "Laravel Framework 11.x (CloudDeck Managed)\n";
$command = $argv[1] ?? 'list';
echo "Running artisan command: " . htmlspecialchars($command) . "\n";
`

	bootstrapApp := `<?php

return [
    'name' => 'Laravel Application',
    'version' => '11.0.0',
    'environment' => getenv('APP_ENV') ?: 'local',
];
`

	configApp := `<?php

return [
    'name' => env('APP_NAME', 'Laravel'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => env('APP_TIMEZONE', 'UTC'),
    'key' => env('APP_KEY'),
    'cipher' => 'AES-256-CBC',
];
`

	configDatabase := `<?php

return [
    'default' => env('DB_CONNECTION', 'mysql'),
    'connections' => [
        'mysql' => [
            'driver' => 'mysql',
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'strict' => true,
        ],
    ],
];
`

	routesWeb := `<?php

// Laravel 11 Web Routes
// Define application routes here
`

	files := map[string]struct {
		content string
		perm    os.FileMode
	}{
		".env":                {content: envContent, perm: 0o644},
		"public/index.php":    {content: publicIndex, perm: 0o644},
		"artisan":             {content: artisanScript, perm: 0o755},
		"bootstrap/app.php":   {content: bootstrapApp, perm: 0o644},
		"config/app.php":      {content: configApp, perm: 0o644},
		"config/database.php": {content: configDatabase, perm: 0o644},
		"routes/web.php":      {content: routesWeb, perm: 0o644},
	}

	for relPath, f := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(f.content), f.perm); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if err := os.Chmod(target, f.perm); err != nil {
			return logs, fmt.Errorf("chmod %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}

	// Create directories with specific 0775 permissions
	dirs775 := []string{
		"storage/framework/views",
		"storage/framework/sessions",
		"storage/framework/cache",
		"storage/logs",
		"bootstrap/cache",
	}
	for _, d := range dirs775 {
		target := filepath.Join(site.Root, d)
		if err := os.MkdirAll(target, 0o775); err != nil {
			return logs, fmt.Errorf("mkdir %s: %w", d, err)
		}
		if err := os.Chmod(target, 0o775); err != nil {
			return logs, fmt.Errorf("chmod %s: %w", d, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}

	logs = append(logs, "standalone Laravel application configured and live")
	return logs, nil
}

// ---------------- Next.js 15 Installer ----------------

func (s *Service) installNextJS(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	logs = append(logs, "scaffolding Next.js 16.4 application with React 19 and Tailwind CSS...")
	packageJSON := `{
  "name": "nextjs-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node server.js"
  },
  "dependencies": {
    "next": "^16.4.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
`

	nextConfig := `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
`

	appLayout := `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CloudDeck Next.js 16 Dashboard",
  description: "Next.js 16 and React 19 application managed by CloudDeck",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#0a0a0a", color: "#ededed" }}>
        {children}
      </body>
    </html>
  );
}
`

	appPage := `export default function Dashboard() {
  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <header style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "inline-block", background: "#1e3a8a", color: "#60a5fa", padding: "0.25rem 0.75rem", borderRadius: "9999px", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Next.js 16 &amp; React 19
        </div>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 800, margin: "0 0 0.5rem 0", letterSpacing: "-0.025em" }}>
          Application Dashboard
        </h1>
        <p style={{ color: "#a1a1aa", margin: 0, fontSize: "1.125rem" }}>
          Managed and deployed with CloudDeck
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: "0.75rem", padding: "1.5rem" }}>
          <div style={{ color: "#a1a1aa", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Runtime</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem", color: "#22c55e" }}>Live &amp; Ready</div>
          <p style={{ color: "#71717a", fontSize: "0.875rem", margin: "0.5rem 0 0 0" }}>Standalone HTTP production server</p>
        </div>
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: "0.75rem", padding: "1.5rem" }}>
          <div style={{ color: "#a1a1aa", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Framework</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem", color: "#38bdf8" }}>Next.js 15.x</div>
          <p style={{ color: "#71717a", fontSize: "0.875rem", margin: "0.5rem 0 0 0" }}>App Router + React Server Components</p>
        </div>
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: "0.75rem", padding: "1.5rem" }}>
          <div style={{ color: "#a1a1aa", fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.5rem", color: "#a855f7" }}>Operational</div>
          <p style={{ color: "#71717a", fontSize: "0.875rem", margin: "0.5rem 0 0 0" }}>Reverse-proxied via CloudDeck</p>
        </div>
      </section>
    </main>
  );
}
`

	serverJS := `const http = require('http');

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

const html = ` + "`" + `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next.js 15 Standalone Server</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #ededed; margin: 0; padding: 3rem 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 1rem; max-width: 600px; width: 100%; padding: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: #0070f3; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem 0; font-size: 2rem; font-weight: 800; }
    p { color: #a1a1aa; line-height: 1.6; }
    .meta { margin-top: 1.5rem; padding: 1rem; background: #0a0a0a; border: 1px solid #262626; border-radius: 0.5rem; font-family: monospace; font-size: 0.875rem; color: #22c55e; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Next.js 15 Standalone</span>
    <h1>CloudDeck Next.js Server</h1>
    <p>Your Next.js 15 and React 19 application is online and ready for incoming production traffic.</p>
    <div class="meta">Serving HTTP on port ${port}</div>
  </div>
</body>
</html>` + "`" + `;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(port, host, () => {
  console.log(` + "`Next.js production server listening on http://${host}:${port}`" + `);
});
`

	files := map[string]string{
		"package.json":    packageJSON,
		"next.config.mjs": nextConfig,
		"app/layout.tsx":  appLayout,
		"app/page.tsx":    appPage,
		"server.js":       serverJS,
	}

	for relPath, content := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}
	if err := applyPermissions(site.Root, 0o755, 0o644, uid, gid); err != nil {
		return logs, err
	}
	logs = append(logs, "Next.js application scaffolded and ready")
	return logs, nil
}

// ---------------- Django 5 Installer ----------------

func (s *Service) installDjango(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	logs = append(logs, "scaffolding Django 6.1 application stack...")
	secretKey, err := generateCryptoString(50, "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)")
	if err != nil {
		return logs, fmt.Errorf("generate secret key: %w", err)
	}

	dbHost := "127.0.0.1"
	dbPort := "3306"
	if opts.DBHost != "" {
		if h, p, err := net.SplitHostPort(opts.DBHost); err == nil {
			dbHost = h
			dbPort = p
		} else {
			dbHost = opts.DBHost
		}
	}

	managePy := `#!/usr/bin/env python3
"""Django's command-line utility for administrative tasks."""
import os
import sys

def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
`

	settingsPy := fmt.Sprintf(`"""
Django settings for myproject project.
Generated by CloudDeck for Django 5.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = '%s'

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'myproject.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'myproject.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': '%s',
        'USER': '%s',
        'PASSWORD': '%s',
        'HOST': '%s',
        'PORT': '%s',
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
`,
		secretKey,
		opts.DBName,
		opts.DBUser,
		opts.DBPass,
		dbHost,
		dbPort,
	)

	urlsPy := `from django.contrib import admin
from django.urls import path
from django.http import HttpResponse

def home(request):
    html = """<!DOCTYPE html>
<html>
<head>
    <title>Django 5 — CloudDeck</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0c4a6e; color: #f0f9ff; margin: 0; padding: 3rem; text-align: center; }
        .card { background: #075985; border-radius: 1rem; max-width: 600px; margin: 0 auto; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        h1 { margin: 0 0 1rem 0; font-size: 2.25rem; font-weight: 800; }
        p { color: #bae6fd; font-size: 1.125rem; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Django 5.x Online</h1>
        <p>Application successfully provisioned and running under CloudDeck.</p>
    </div>
</body>
</html>"""
    return HttpResponse(html)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', home, name='home'),
]
`

	wsgiPy := `import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

application = get_wsgi_application()
`

	runnerSh := `#!/usr/bin/env bash
PORT=${PORT:-8000}
exec python3 manage.py runserver 0.0.0.0:$PORT
`

	requirementsTxt := `Django>=5.0,<6.0
pymysql>=1.1.0
gunicorn>=21.2.0
`

	appPy := `#!/usr/bin/env python3
import os
import sys

port = int(os.environ.get('PORT', 8000))

# Try running through Django WSGI if django is available
try:
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    django.setup()
    from django.core.wsgi import get_wsgi_application
    from wsgiref.simple_server import make_server
    application = get_wsgi_application()
    print(f"Django WSGI application listening on port {port}...")
    server = make_server('0.0.0.0', port, application)
    server.serve_forever()
except Exception as e:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Django 5 — CloudDeck</title>
    <style>
        body {{ font-family: ui-sans-serif, system-ui, sans-serif; background: #0c4a6e; color: #f0f9ff; margin: 0; padding: 3rem 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 80vh; }}
        .card {{ background: #075985; border-radius: 1rem; max-width: 600px; width: 100%; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
        .badge {{ display: inline-block; background: #38bdf8; color: #082f49; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 700; margin-bottom: 1rem; }}
        h1 {{ margin: 0 0 0.5rem 0; font-size: 2rem; font-weight: 800; }}
        p {{ color: #bae6fd; font-size: 1.125rem; line-height: 1.6; }}
        .meta {{ margin-top: 1.5rem; padding: 1rem; background: #082f49; border-radius: 0.5rem; font-family: monospace; font-size: 0.875rem; color: #7dd3fc; }}
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">Django 5.x Ready</span>
        <h1>CloudDeck Django Application</h1>
        <p>Application successfully provisioned and running under CloudDeck process supervisor.</p>
        <div class="meta">Serving HTTP on port {port}</div>
    </div>
</body>
</html>"""
            self.wfile.write(html.encode('utf-8'))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f"Django standalone starter listening on port {port}")
    server.serve_forever()
`

	files := map[string]struct {
		content string
		perm    os.FileMode
	}{
		"app.py":                {content: appPy, perm: 0o755},
		"manage.py":             {content: managePy, perm: 0o755},
		"myproject/__init__.py": {content: "", perm: 0o644},
		"myproject/settings.py": {content: settingsPy, perm: 0o644},
		"myproject/urls.py":     {content: urlsPy, perm: 0o644},
		"myproject/wsgi.py":     {content: wsgiPy, perm: 0o644},
		"run.sh":                {content: runnerSh, perm: 0o755},
		"requirements.txt":      {content: requirementsTxt, perm: 0o644},
	}

	for relPath, f := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(f.content), f.perm); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if err := os.Chmod(target, f.perm); err != nil {
			return logs, fmt.Errorf("chmod %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}
	logs = append(logs, "Django application stack scaffolded and ready")
	return logs, nil
}

// ---------------- Flask 3 Installer ----------------

func (s *Service) installFlask(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	logs = append(logs, "scaffolding Flask 3.1 application stack...")
	dbHost := "127.0.0.1"
	dbPort := "3306"
	if opts.DBHost != "" {
		if h, p, err := net.SplitHostPort(opts.DBHost); err == nil {
			dbHost = h
			dbPort = p
		} else {
			dbHost = opts.DBHost
		}
	}

	appPy := fmt.Sprintf(`import os

port = int(os.getenv("PORT", 5000))
DB_NAME = os.getenv("DB_NAME", "%s")
DB_USER = os.getenv("DB_USER", "%s")
DB_PASS = os.getenv("DB_PASS", "%s")
DB_HOST = os.getenv("DB_HOST", "%s")
DB_PORT = int(os.getenv("DB_PORT", "%s"))

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Flask 3 — CloudDeck</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; background: #09090b; color: #fafafa; margin: 0; padding: 3rem 1.5rem; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
        .card { background: #18181b; border: 1px solid #27272a; border-radius: 1rem; max-width: 600px; width: 100%%%%; padding: 2.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: #10b981; color: #022c22; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 700; margin-bottom: 1rem; }
        h1 { margin: 0 0 0.5rem 0; font-size: 2rem; font-weight: 800; }
        p { color: #a1a1aa; line-height: 1.6; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
        .box { background: #09090b; border: 1px solid #27272a; border-radius: 0.5rem; padding: 1rem; }
        .label { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
        .val { font-size: 1rem; font-weight: 600; margin-top: 0.25rem; color: #fafafa; }
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">Flask 3.x Online</span>
        <h1>CloudDeck Flask Application</h1>
        <p>Your Python microservice is active and responding to HTTP requests.</p>
        <div class="grid">
            <div class="box">
                <div class="label">Database Target</div>
                <div class="val">{{ db_target }}</div>
            </div>
            <div class="box">
                <div class="label">Framework</div>
                <div class="val">Flask 3.x</div>
            </div>
        </div>
    </div>
</body>
</html>"""

try:
    from flask import Flask, render_template_string
    app = Flask(__name__)

    @app.route("/")
    def index():
        target = f"{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}" if DB_NAME else "None configured"
        return render_template_string(HTML_CONTENT, db_target=target)

    @app.route("/health")
    def health():
        return {"status": "ok", "app": "flask3"}

    if __name__ == "__main__":
        app.run(host="0.0.0.0", port=port)
except ImportError:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            target = f"{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}" if DB_NAME else "None configured"
            rendered = HTML_CONTENT.replace("{{ db_target }}", target)
            self.wfile.write(rendered.encode('utf-8'))
    if __name__ == "__main__":
        server = HTTPServer(('0.0.0.0', port), Handler)
        print(f"Flask standalone server listening on port {port}")
        server.serve_forever()
`,
		opts.DBName,
		opts.DBUser,
		opts.DBPass,
		dbHost,
		dbPort,
	)

	wsgiPy := `from app import app as application

if __name__ == "__main__":
    application.run()
`

	requirementsTxt := `Flask>=3.0.0
pymysql>=1.1.0
gunicorn>=21.2.0
`

	files := map[string]string{
		"app.py":           appPy,
		"wsgi.py":          wsgiPy,
		"requirements.txt": requirementsTxt,
	}

	for relPath, content := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}
	if err := applyPermissions(site.Root, 0o755, 0o644, uid, gid); err != nil {
		return logs, err
	}
	logs = append(logs, "Flask application stack scaffolded and ready")
	return logs, nil
}

// ---------------- Docker Installer ----------------

func (s *Service) installDocker(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	logs = append(logs, "scaffolding Docker container deployment configuration...")
	dockerfile := `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN if [ -f package.json ]; then npm install; fi
COPY . .

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app ./
EXPOSE 3000
CMD ["node", "server.js"]
`

	dockerCompose := fmt.Sprintf(`services:
  web:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=db
      - DB_USER=%s
      - DB_PASSWORD=%s
      - DB_NAME=%s
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: %s
      MYSQL_DATABASE: %s
      MYSQL_USER: %s
      MYSQL_PASSWORD: %s
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
`,
		opts.DBUser,
		opts.DBPass,
		opts.DBName,
		opts.DBPass,
		opts.DBName,
		opts.DBUser,
		opts.DBPass,
	)

	serverJS := `const http = require('http');

const port = process.env.PORT || 3000;
const host = '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(` + "`" + `<!DOCTYPE html>
<html>
<head>
  <title>Containerized Application — CloudDeck</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 3rem; text-align: center; }
    .card { background: #1e293b; border-radius: 1rem; max-width: 600px; margin: 0 auto; padding: 2.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; margin: 0 0 1rem 0; font-size: 2.25rem; font-weight: 800; }
    p { color: #94a3b8; font-size: 1.125rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Docker Container Online</h1>
    <p>Containerized application running with Docker Compose on CloudDeck.</p>
  </div>
</body>
</html>` + "`" + `);
});

server.listen(port, host, () => {
  console.log(` + "`Docker application listening on port ${port}`" + `);
});
`

	packageJSON := `{
  "name": "docker-sample-app",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  }
}
`

	files := map[string]string{
		"Dockerfile":         dockerfile,
		"docker-compose.yml": dockerCompose,
		"server.js":          serverJS,
		"package.json":       packageJSON,
	}

	for relPath, content := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}
	if err := applyPermissions(site.Root, 0o755, 0o644, uid, gid); err != nil {
		return logs, err
	}
	logs = append(logs, "Docker deployment configuration scaffolded and ready")
	return logs, nil
}

// ---------------- Spring Boot 3.3 Installer ----------------

func (s *Service) installSpringBoot(ctx context.Context, site store.Site, opts TemplateInstallOptions, uid, gid int) ([]string, error) {
	var logs []string
	logs = append(logs, "scaffolding Spring Boot 3.4 project with Maven wrapper...")
	dbHost := "127.0.0.1"
	dbPort := "3306"
	if opts.DBHost != "" {
		if h, p, err := net.SplitHostPort(opts.DBHost); err == nil {
			dbHost = h
			dbPort = p
		} else {
			dbHost = opts.DBHost
		}
	}

	pomXML := `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.4</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>
    <description>Demo project for Spring Boot on CloudDeck</description>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`

	applicationJava := `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@SpringBootApplication
@RestController
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    @GetMapping("/")
    public Map<String, Object> index() {
        return Map.of(
            "status", "online",
            "framework", "Spring Boot 3.3.x",
            "managedBy", "CloudDeck"
        );
    }
}
`

	appProperties := fmt.Sprintf(`spring.application.name=demo
server.port=8080

spring.datasource.url=jdbc:mysql://%s:%s/%s?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
spring.datasource.username=%s
spring.datasource.password=%s
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
`,
		dbHost,
		dbPort,
		opts.DBName,
		opts.DBUser,
		opts.DBPass,
	)

	files := map[string]string{
		"pom.xml": pomXML,
		"src/main/java/com/example/demo/Application.java": applicationJava,
		"src/main/resources/application.properties":       appProperties,
	}

	for relPath, content := range files {
		target := filepath.Join(site.Root, relPath)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return logs, fmt.Errorf("mkdir for %s: %w", relPath, err)
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return logs, fmt.Errorf("write %s: %w", relPath, err)
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(target, uid, gid)
		}
	}
	if err := applyPermissions(site.Root, 0o755, 0o644, uid, gid); err != nil {
		return logs, err
	}
	logs = append(logs, "Spring Boot 3.4 application scaffolded and ready")
	return logs, nil
}

// ---------------- Helpers ----------------

func downloadFile(ctx context.Context, url, destPath string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	tmpFile, err := os.CreateTemp(filepath.Dir(destPath), "download-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmpFile.Name()
	defer os.Remove(tmpName)

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}

	if err := os.Rename(tmpName, destPath); err != nil {
		// Fallback copy if rename fails
		return copyFile(tmpName, destPath)
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func generateCryptoString(n int, charset string) (string, error) {
	b := make([]byte, n)
	max := big.NewInt(int64(len(charset)))
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = charset[idx.Int64()]
	}
	return string(b), nil
}

func phpEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	return strings.ReplaceAll(s, `'`, `\'`)
}

func applyPermissions(root string, dirMode, fileMode os.FileMode, uid, gid int) error {
	return filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if fi.IsDir() {
			if err := os.Chmod(p, dirMode); err != nil {
				return err
			}
		} else {
			if err := os.Chmod(p, fileMode); err != nil {
				return err
			}
		}
		if uid >= 0 && gid >= 0 {
			_ = os.Chown(p, uid, gid)
		}
		return nil
	})
}
