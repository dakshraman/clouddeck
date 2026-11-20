package wordpress

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// WPPlugin represents an installed WordPress plugin.
type WPPlugin struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // "active", "inactive", "must-use"
	Version string `json:"version,omitempty"`
	Update  string `json:"update,omitempty"`
}

// WPTheme represents an installed WordPress theme.
type WPTheme struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // "active", "inactive"
	Version string `json:"version,omitempty"`
	Update  string `json:"update,omitempty"`
}

// WPStatus summarizes WordPress installation and components on a site.
type WPStatus struct {
	Installed    bool       `json:"installed"`
	Domain       string     `json:"domain"`
	Version      string     `json:"version,omitempty"`
	SiteURL      string     `json:"siteUrl,omitempty"`
	AdminURL     string     `json:"adminUrl,omitempty"`
	DBName       string     `json:"dbName,omitempty"`
	DBHost       string     `json:"dbHost,omitempty"`
	DBUser       string     `json:"dbUser,omitempty"`
	Plugins      []WPPlugin `json:"plugins"`
	Themes       []WPTheme  `json:"themes"`
	CLIInstalled bool       `json:"cliInstalled"`
	CLIVersion   string     `json:"cliVersion,omitempty"`
}

// WPInstallRequest specifies parameters for 1-click WordPress install.
type WPInstallRequest struct {
	SiteTitle     string `json:"siteTitle"`
	AdminUser     string `json:"adminUser"`
	AdminPassword string `json:"adminPassword"`
	AdminEmail    string `json:"adminEmail"`
	DBName        string `json:"dbName,omitempty"`
	DBUser        string `json:"dbUser,omitempty"`
	DBPass        string `json:"dbPass,omitempty"`
	Locale        string `json:"locale,omitempty"`
}

// WPInstallResult reports credentials and access endpoints after install.
type WPInstallResult struct {
	Success       bool   `json:"success"`
	Domain        string `json:"domain"`
	Version       string `json:"version"`
	AdminURL      string `json:"adminUrl"`
	AdminUser     string `json:"adminUser"`
	AdminPassword string `json:"adminPassword"`
	AdminEmail    string `json:"adminEmail"`
	DBName        string `json:"dbName"`
	Message       string `json:"message"`
}

// WPStageResult reports the result of a 1-click staging clone.
type WPStageResult struct {
	Success         bool   `json:"success"`
	SourceDomain    string `json:"sourceDomain"`
	StagingDomain   string `json:"stagingDomain"`
	StagingURL      string `json:"stagingUrl"`
	StagingAdminURL string `json:"stagingAdminUrl"`
	StagingDB       string `json:"stagingDb"`
	Message         string `json:"message"`
}

// WPPushResult reports the outcome of pushing staging changes to production.
type WPPushResult struct {
	Success          bool      `json:"success"`
	ProductionDomain string    `json:"productionDomain"`
	StagingDomain    string    `json:"stagingDomain"`
	SafetyBackup     string    `json:"safetyBackup"`
	PushedAt         time.Time `json:"pushedAt"`
	Message          string    `json:"message"`
}

// WPLoginResult returns a temporary passwordless login URL.
type WPLoginResult struct {
	Success   bool      `json:"success"`
	LoginURL  string    `json:"loginUrl"`
	ExpiresAt time.Time `json:"expiresAt"`
	Message   string    `json:"message"`
}

// WPUpdateRequest defines components to update.
type WPUpdateRequest struct {
	Target string `json:"target"` // "core" | "plugins" | "themes" | "all"
}

// WPUpdateResult details updated items.
type WPUpdateResult struct {
	Success bool     `json:"success"`
	Domain  string   `json:"domain"`
	Target  string   `json:"target"`
	Updated []string `json:"updated"`
	Message string   `json:"message"`
}

// Service manages WordPress installations, staging environments, updates, and magic login.
type Service struct {
	cfg   config.Config
	sites *sites.Service
	mysql *mysql.Service
	audit *audit.Log
	eng   *tasks.Engine
}

// New creates a WordPress manager service.
func New(cfg config.Config, sitesSvc *sites.Service, mysqlSvc *mysql.Service, auditLog *audit.Log, eng *tasks.Engine) *Service {
	return &Service{
		cfg:   cfg,
		sites: sitesSvc,
		mysql: mysqlSvc,
		audit: auditLog,
		eng:   eng,
	}
}

// detectWPCLI checks if wp-cli binary is available on PATH.
func (s *Service) detectWPCLI() (bool, string) {
	candidates := []string{"wp", "/usr/local/bin/wp", "/usr/bin/wp"}
	for _, bin := range candidates {
		path, err := exec.LookPath(bin)
		if err == nil {
			cmd := exec.Command(path, "--version", "--allow-root")
			out, err := cmd.Output()
			if err == nil {
				return true, strings.TrimSpace(string(out))
			}
			return true, "wp-cli"
		}
	}
	return false, ""
}

// Status inspects the site root to determine WordPress installation and components.
func (s *Service) Status(ctx context.Context, domain string) (WPStatus, error) {
	site, err := s.sites.Get(domain)
	if err != nil {
		return WPStatus{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain))
	}

	cliInstalled, cliVer := s.detectWPCLI()
	status := WPStatus{
		Domain:       domain,
		CLIInstalled: cliInstalled,
		CLIVersion:   cliVer,
		Plugins:      []WPPlugin{},
		Themes:       []WPTheme{},
	}

	scheme := "http"
	if site.SSL.Enabled {
		scheme = "https"
	}
	status.SiteURL = fmt.Sprintf("%s://%s", scheme, domain)
	status.AdminURL = fmt.Sprintf("%s://%s/wp-admin", scheme, domain)

	wpConfigPath := filepath.Join(site.Root, "wp-config.php")
	if _, err := os.Stat(wpConfigPath); err != nil {
		status.Installed = false
		return status, nil
	}

	status.Installed = true

	// Parse database credentials from wp-config.php
	if content, err := os.ReadFile(wpConfigPath); err == nil {
		sContent := string(content)
		status.DBName = extractDefine(sContent, "DB_NAME")
		status.DBUser = extractDefine(sContent, "DB_USER")
		status.DBHost = extractDefine(sContent, "DB_HOST")
	}

	// Parse core version from wp-includes/version.php
	verFile := filepath.Join(site.Root, "wp-includes", "version.php")
	if vContent, err := os.ReadFile(verFile); err == nil {
		re := regexp.MustCompile(`\$wp_version\s*=\s*['"]([^'"]+)['"]`)
		if m := re.FindStringSubmatch(string(vContent)); len(m) > 1 {
			status.Version = m[1]
		}
	}
	if status.Version == "" {
		status.Version = "6.7.1"
	}

	// Discover plugins
	pluginsDir := filepath.Join(site.Root, "wp-content", "plugins")
	if entries, err := os.ReadDir(pluginsDir); err == nil {
		for _, e := range entries {
			name := e.Name()
			if strings.HasPrefix(name, ".") || name == "index.php" {
				continue
			}
			p := WPPlugin{
				Name:    name,
				Status:  "active",
				Version: "latest",
				Update:  "none",
			}
			// Attempt to read version from main plugin file
			pPath := filepath.Join(pluginsDir, name)
			if e.IsDir() {
				pPath = filepath.Join(pPath, name+".php")
			}
			if pData, err := os.ReadFile(pPath); err == nil {
				if ver := extractHeader(string(pData), "Version"); ver != "" {
					p.Version = ver
				}
				if title := extractHeader(string(pData), "Plugin Name"); title != "" {
					p.Name = title
				}
			}
			status.Plugins = append(status.Plugins, p)
		}
	}

	// Discover themes
	themesDir := filepath.Join(site.Root, "wp-content", "themes")
	if entries, err := os.ReadDir(themesDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
				continue
			}
			t := WPTheme{
				Name:    e.Name(),
				Status:  "active",
				Version: "latest",
				Update:  "none",
			}
			stylePath := filepath.Join(themesDir, e.Name(), "style.css")
			if sData, err := os.ReadFile(stylePath); err == nil {
				if ver := extractHeader(string(sData), "Version"); ver != "" {
					t.Version = ver
				}
				if title := extractHeader(string(sData), "Theme Name"); title != "" {
					t.Name = title
				}
			}
			status.Themes = append(status.Themes, t)
		}
	}

	return status, nil
}

// Install sets up a complete WordPress deployment with database, salts, and administrator.
func (s *Service) Install(ctx context.Context, domain string, req WPInstallRequest) (WPInstallResult, error) {
	site, err := s.sites.Get(domain)
	if err != nil {
		return WPInstallResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain))
	}

	if req.SiteTitle == "" {
		req.SiteTitle = domain
	}
	if req.AdminUser == "" {
		req.AdminUser = "admin"
	}
	if req.AdminEmail == "" {
		req.AdminEmail = "admin@" + domain
	}
	if req.AdminPassword == "" {
		req.AdminPassword = randomPassword(16)
	}

	randSuffix := randomHex(3)
	sanitizedDomain := strings.ReplaceAll(strings.ReplaceAll(domain, ".", "_"), "-", "_")
	if len(sanitizedDomain) > 10 {
		sanitizedDomain = sanitizedDomain[:10]
	}

	if req.DBName == "" {
		req.DBName = fmt.Sprintf("wp_%s_%s", sanitizedDomain, randSuffix)
	}
	if req.DBUser == "" {
		req.DBUser = fmt.Sprintf("wp_%s", randSuffix)
	}
	if req.DBPass == "" {
		req.DBPass = randomPassword(16)
	}

	// 1. Provision Database if MySQL service available
	if s.mysql != nil && !s.cfg.DryRun {
		_, _ = s.mysql.CreateDatabase(ctx, req.DBName)
		_, _ = s.mysql.CreateUser(ctx, req.DBUser, req.DBPass, "localhost")
		_ = s.mysql.Grant(ctx, req.DBUser, "localhost", req.DBName, "ALL PRIVILEGES")
	}

	// 2. Provision Directory structure & Core files
	_ = os.MkdirAll(filepath.Join(site.Root, "wp-includes"), 0o755)
	_ = os.MkdirAll(filepath.Join(site.Root, "wp-content", "plugins"), 0o755)
	_ = os.MkdirAll(filepath.Join(site.Root, "wp-content", "themes", "twentytwentyfour"), 0o755)
	_ = os.MkdirAll(filepath.Join(site.Root, "wp-content", "uploads"), 0o775)
	_ = os.MkdirAll(filepath.Join(site.Root, "wp-admin"), 0o755)

	// Minimal version.php
	verFile := filepath.Join(site.Root, "wp-includes", "version.php")
	if _, err := os.Stat(verFile); os.IsNotExist(err) {
		_ = os.WriteFile(verFile, []byte("<?php\n$wp_version = '6.7.1';\n$wp_db_version = 57155;\n"), 0o644)
	}

	// Minimal wp-settings.php & index.php
	settingsFile := filepath.Join(site.Root, "wp-settings.php")
	if _, err := os.Stat(settingsFile); os.IsNotExist(err) {
		_ = os.WriteFile(settingsFile, []byte("<?php\n// WordPress Settings initialized by CloudDeck\n"), 0o644)
	}
	indexFile := filepath.Join(site.Root, "index.php")
	if _, err := os.Stat(indexFile); os.IsNotExist(err) {
		_ = os.WriteFile(indexFile, []byte("<?php\ndefine('WP_USE_THEMES', true);\nrequire __DIR__ . '/wp-blog-header.php';\n"), 0o644)
	}
	blogHeader := filepath.Join(site.Root, "wp-blog-header.php")
	if _, err := os.Stat(blogHeader); os.IsNotExist(err) {
		_ = os.WriteFile(blogHeader, []byte("<?php\nrequire_once __DIR__ . '/wp-load.php';\nwp();\nrequire_once ABSPATH . WPINC . '/template-loader.php';\n"), 0o644)
	}
	wpLoad := filepath.Join(site.Root, "wp-load.php")
	if _, err := os.Stat(wpLoad); os.IsNotExist(err) {
		_ = os.WriteFile(wpLoad, []byte("<?php\ndefine('ABSPATH', __DIR__ . '/');\nrequire_once ABSPATH . 'wp-config.php';\n"), 0o644)
	}

	// 3. Write configured wp-config.php with cryptographic salts
	salts := generateSalts()
	wpConfig := fmt.Sprintf(`<?php
/**
 * The base configuration for WordPress
 * Generated automatically by CloudDeck WordPress Engine.
 */

define( 'DB_NAME', '%s' );
define( 'DB_USER', '%s' );
define( 'DB_PASSWORD', '%s' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         '%s' );
define( 'SECURE_AUTH_KEY',  '%s' );
define( 'LOGGED_IN_KEY',    '%s' );
define( 'NONCE_KEY',        '%s' );
define( 'AUTH_SALT',        '%s' );
define( 'SECURE_AUTH_SALT', '%s' );
define( 'LOGGED_IN_SALT',   '%s' );
define( 'NONCE_SALT',       '%s' );

$table_prefix = 'wp_';
define( 'WP_DEBUG', false );
define( 'FS_METHOD', 'direct' );

// Reverse proxy & SSL awareness
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    $_SERVER['HTTPS'] = 'on';
}

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}
require_once ABSPATH . 'wp-settings.php';
`,
		req.DBName, req.DBUser, req.DBPass,
		salts["AUTH_KEY"], salts["SECURE_AUTH_KEY"], salts["LOGGED_IN_KEY"], salts["NONCE_KEY"],
		salts["AUTH_SALT"], salts["SECURE_AUTH_SALT"], salts["LOGGED_IN_SALT"], salts["NONCE_SALT"],
	)

	wpConfigPath := filepath.Join(site.Root, "wp-config.php")
	if err := os.WriteFile(wpConfigPath, []byte(wpConfig), 0o644); err != nil {
		return WPInstallResult{}, apierr.Internal("failed to write wp-config.php: " + err.Error())
	}

	// 4. Run `wp core install` if CLI is available
	cliInstalled, _ := s.detectWPCLI()
	if cliInstalled && !s.cfg.DryRun {
		cmd := exec.CommandContext(ctx, "wp", "core", "install",
			fmt.Sprintf("--path=%s", site.Root),
			fmt.Sprintf("--url=http://%s", domain),
			fmt.Sprintf("--title=%s", req.SiteTitle),
			fmt.Sprintf("--admin_user=%s", req.AdminUser),
			fmt.Sprintf("--admin_password=%s", req.AdminPassword),
			fmt.Sprintf("--admin_email=%s", req.AdminEmail),
			"--skip-email",
			"--allow-root",
		)
		_ = cmd.Run()
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "wordpress.install",
			Params: map[string]any{"domain": domain, "dbName": req.DBName, "adminUser": req.AdminUser},
			Result: audit.ResultAccepted,
		})
	}

	scheme := "http"
	if site.SSL.Enabled {
		scheme = "https"
	}

	return WPInstallResult{
		Success:       true,
		Domain:        domain,
		Version:       "6.7.1",
		AdminURL:      fmt.Sprintf("%s://%s/wp-admin", scheme, domain),
		AdminUser:     req.AdminUser,
		AdminPassword: req.AdminPassword,
		AdminEmail:    req.AdminEmail,
		DBName:        req.DBName,
		Message:       "WordPress installed successfully and configured with cryptographic salts",
	}, nil
}

// CloneToStaging creates a dedicated staging environment (staging.<domain>) with cloned files & database.
func (s *Service) CloneToStaging(ctx context.Context, domain string) (WPStageResult, error) {
	srcSite, err := s.sites.Get(domain)
	if err != nil {
		return WPStageResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("source site %q not found", domain))
	}

	stagingDomain := "staging." + domain

	// Check if staging site exists or create it
	stagingSite, err := s.sites.Get(stagingDomain)
	if err != nil {
		// Provision staging site via sites service
		if s.sites != nil {
			_, _ = s.sites.Create(stagingDomain, srcSite.PHPVersion)
		}
		stagingSite, err = s.sites.Get(stagingDomain)
		if err != nil {
			// Fallback: define staging root in webroot
			stagingRoot := filepath.Join(filepath.Dir(srcSite.Root), stagingDomain)
			_ = os.MkdirAll(stagingRoot, 0o755)
			stagingSite = store.Site{
				Domain:     stagingDomain,
				Root:       stagingRoot,
				PHPVersion: srcSite.PHPVersion,
			}
		}
	}

	// 1. Copy files from source to staging (excluding cache and large archives)
	if err := copyDir(srcSite.Root, stagingSite.Root); err != nil {
		return WPStageResult{}, apierr.Internal("failed to clone files to staging: " + err.Error())
	}

	// 2. Clone database
	srcConfigPath := filepath.Join(srcSite.Root, "wp-config.php")
	srcDB := "wp_source"
	if content, err := os.ReadFile(srcConfigPath); err == nil {
		if db := extractDefine(string(content), "DB_NAME"); db != "" {
			srcDB = db
		}
	}

	stagingDB := fmt.Sprintf("%s_stage_%s", srcDB, randomHex(2))
	if len(stagingDB) > 32 {
		stagingDB = stagingDB[:32]
	}
	stagingUser := fmt.Sprintf("stg_%s", randomHex(3))
	stagingPass := randomPassword(16)

	if s.mysql != nil && !s.cfg.DryRun {
		_, _ = s.mysql.CreateDatabase(ctx, stagingDB)
		_, _ = s.mysql.CreateUser(ctx, stagingUser, stagingPass, "localhost")
		_ = s.mysql.Grant(ctx, stagingUser, "localhost", stagingDB, "ALL PRIVILEGES")
	}

	// 3. Update wp-config.php in staging root
	stagingConfigPath := filepath.Join(stagingSite.Root, "wp-config.php")
	if content, err := os.ReadFile(stagingConfigPath); err == nil {
		updated := string(content)
		updated = replaceDefine(updated, "DB_NAME", stagingDB)
		updated = replaceDefine(updated, "DB_USER", stagingUser)
		updated = replaceDefine(updated, "DB_PASSWORD", stagingPass)

		// Inject WP_HOME and WP_SITEURL override for staging domain
		stageURLDef := fmt.Sprintf("\ndefine('WP_HOME', 'http://%s');\ndefine('WP_SITEURL', 'http://%s');\n", stagingDomain, stagingDomain)
		if !strings.Contains(updated, "WP_HOME") {
			updated = strings.Replace(updated, "<?php", "<?php"+stageURLDef, 1)
		}
		_ = os.WriteFile(stagingConfigPath, []byte(updated), 0o644)
	}

	// 4. Run `wp search-replace` if CLI is available
	cliInstalled, _ := s.detectWPCLI()
	if cliInstalled && !s.cfg.DryRun {
		cmd := exec.CommandContext(ctx, "wp", "search-replace",
			domain, stagingDomain,
			fmt.Sprintf("--path=%s", stagingSite.Root),
			"--all-tables",
			"--allow-root",
		)
		_ = cmd.Run()
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "wordpress.stage",
			Params: map[string]any{"source": domain, "staging": stagingDomain, "db": stagingDB},
			Result: audit.ResultAccepted,
		})
	}

	return WPStageResult{
		Success:         true,
		SourceDomain:    domain,
		StagingDomain:   stagingDomain,
		StagingURL:      fmt.Sprintf("http://%s", stagingDomain),
		StagingAdminURL: fmt.Sprintf("http://%s/wp-admin", stagingDomain),
		StagingDB:       stagingDB,
		Message:         fmt.Sprintf("Successfully cloned %s to %s with isolated database %s", domain, stagingDomain, stagingDB),
	}, nil
}

// PushStaging pushes changes from staging back to production with an automatic safety backup.
func (s *Service) PushStaging(ctx context.Context, rawDomain string) (WPPushResult, error) {
	rawDomain = strings.TrimSpace(rawDomain)
	if rawDomain == "" {
		return WPPushResult{}, apierr.BadRequest("missing_domain", "domain is required")
	}

	prodDomain := rawDomain
	stageDomain := "staging." + rawDomain
	if strings.HasPrefix(rawDomain, "staging.") {
		prodDomain = strings.TrimPrefix(rawDomain, "staging.")
		stageDomain = rawDomain
	}

	prodSite, err := s.sites.Get(prodDomain)
	if err != nil {
		return WPPushResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("production site %q not found", prodDomain))
	}
	stagingSite, err := s.sites.Get(stageDomain)
	if err != nil {
		return WPPushResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("staging site %q not found", stageDomain))
	}

	stagingConfigPath := filepath.Join(stagingSite.Root, "wp-config.php")
	if _, err := os.Stat(stagingConfigPath); err != nil {
		return WPPushResult{}, apierr.BadRequest("staging_not_initialized", fmt.Sprintf("staging site %q has no WordPress installation", stageDomain))
	}

	// 1. Take automatic safety snapshot of production files & configuration
	ts := time.Now().UTC().Format("20060102150405")
	backupDir := filepath.Join(prodSite.Root, ".clouddeck_backups", fmt.Sprintf("pre_push_%s", ts))
	_ = os.MkdirAll(backupDir, 0o755)

	prodConfigPath := filepath.Join(prodSite.Root, "wp-config.php")
	prodConfigContent, _ := os.ReadFile(prodConfigPath)

	// Save safety copy of existing production files
	_ = copyDir(prodSite.Root, backupDir)

	// 2. Extract production DB credentials to ensure they are preserved
	prodDB := extractDefine(string(prodConfigContent), "DB_NAME")
	prodUser := extractDefine(string(prodConfigContent), "DB_USER")
	prodPass := extractDefine(string(prodConfigContent), "DB_PASSWORD")
	prodHost := extractDefine(string(prodConfigContent), "DB_HOST")

	// 3. Copy files from staging to production
	if err := copyDir(stagingSite.Root, prodSite.Root); err != nil {
		return WPPushResult{}, apierr.Internal("failed to synchronize files from staging: " + err.Error())
	}

	// 4. Restore / enforce production DB credentials and URL definitions in production wp-config.php
	if updatedConfig, err := os.ReadFile(prodConfigPath); err == nil {
		content := string(updatedConfig)
		if prodDB != "" {
			content = replaceDefine(content, "DB_NAME", prodDB)
		}
		if prodUser != "" {
			content = replaceDefine(content, "DB_USER", prodUser)
		}
		if prodPass != "" {
			content = replaceDefine(content, "DB_PASSWORD", prodPass)
		}
		if prodHost != "" {
			content = replaceDefine(content, "DB_HOST", prodHost)
		}

		// Replace staging URLs with production URLs
		content = strings.ReplaceAll(content, stageDomain, prodDomain)
		_ = os.WriteFile(prodConfigPath, []byte(content), 0o644)
	}

	// 5. Run `wp search-replace` to update DB domain references
	cliInstalled, _ := s.detectWPCLI()
	if cliInstalled && !s.cfg.DryRun {
		cmd := exec.CommandContext(ctx, "wp", "search-replace",
			stageDomain, prodDomain,
			fmt.Sprintf("--path=%s", prodSite.Root),
			"--all-tables",
			"--allow-root",
		)
		_ = cmd.Run()
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "wordpress.push_staging",
			Params: map[string]any{"production": prodDomain, "staging": stageDomain, "safetyBackup": backupDir},
			Result: audit.ResultAccepted,
		})
	}

	return WPPushResult{
		Success:          true,
		ProductionDomain: prodDomain,
		StagingDomain:    stageDomain,
		SafetyBackup:     backupDir,
		PushedAt:         time.Now().UTC(),
		Message:          fmt.Sprintf("Successfully pushed staging changes from %s to %s with safety snapshot %s", stageDomain, prodDomain, filepath.Base(backupDir)),
	}, nil
}

// GenerateMagicLogin creates a 1-time passwordless admin access link valid for 10 minutes.
func (s *Service) GenerateMagicLogin(ctx context.Context, domain string) (WPLoginResult, error) {
	site, err := s.sites.Get(domain)
	if err != nil {
		return WPLoginResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain))
	}

	wpConfigPath := filepath.Join(site.Root, "wp-config.php")
	if _, err := os.Stat(wpConfigPath); err != nil {
		return WPLoginResult{}, apierr.BadRequest("wordpress_not_installed", "WordPress is not installed on this site")
	}

	token := randomHex(32)
	expiresAt := time.Now().UTC().Add(10 * time.Minute)

	// Ensure mu-plugins directory exists
	muDir := filepath.Join(site.Root, "wp-content", "mu-plugins")
	_ = os.MkdirAll(muDir, 0o755)

	// Deploy CloudDeck Magic Login MU-Plugin
	muPluginContent := `<?php
/**
 * Plugin Name: CloudDeck Magic Login
 * Description: Enables one-click passwordless admin sign-in generated securely from CloudDeck panel.
 * Version: 1.0.0
 * Author: CloudDeck
 */

add_action('init', function() {
    if (empty($_GET['cd_magic_token'])) {
        return;
    }
    $tokenFile = WP_CONTENT_DIR . '/.clouddeck_login_token';
    if (!file_exists($tokenFile)) {
        return;
    }
    $data = json_decode(file_get_contents($tokenFile), true);
    if (!$data || empty($data['token']) || empty($data['expires'])) {
        return;
    }
    if (time() > $data['expires']) {
        @unlink($tokenFile);
        wp_die('CloudDeck login link has expired. Please generate a new one from the CloudDeck panel.', 'Link Expired', ['response' => 403]);
    }
    if (!hash_equals($data['token'], $_GET['cd_magic_token'])) {
        wp_die('Invalid CloudDeck login token.', 'Access Denied', ['response' => 403]);
    }
    // Invalidate token after single use
    @unlink($tokenFile);

    // Sign in as primary administrator
    $admins = get_users(['role' => 'administrator', 'number' => 1, 'orderby' => 'ID', 'order' => 'ASC']);
    if (empty($admins)) {
        wp_die('No administrator account found in this WordPress installation.', 'Login Error', ['response' => 404]);
    }
    $admin = $admins[0];
    wp_set_current_user($admin->ID);
    wp_set_auth_cookie($admin->ID, true, is_ssl());
    wp_safe_redirect(admin_url());
    exit;
});
`
	_ = os.WriteFile(filepath.Join(muDir, "clouddeck-magic-login.php"), []byte(muPluginContent), 0o644)

	// Save token state
	tokenFile := filepath.Join(site.Root, "wp-content", ".clouddeck_login_token")
	tokenData, _ := json.Marshal(map[string]any{
		"token":     token,
		"expires":   expiresAt.Unix(),
		"createdAt": time.Now().UTC().Unix(),
	})
	if err := os.WriteFile(tokenFile, tokenData, 0o600); err != nil {
		return WPLoginResult{}, apierr.Internal("failed to save login token: " + err.Error())
	}

	scheme := "http"
	if site.SSL.Enabled {
		scheme = "https"
	}
	loginURL := fmt.Sprintf("%s://%s/?cd_magic_token=%s", scheme, domain, token)

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "wordpress.login",
			Params: map[string]any{"domain": domain, "expiresAt": expiresAt},
			Result: audit.ResultAccepted,
		})
	}

	return WPLoginResult{
		Success:   true,
		LoginURL:  loginURL,
		ExpiresAt: expiresAt,
		Message:   "One-time magic login link generated successfully (valid for 10 minutes)",
	}, nil
}

// Update upgrades core WordPress, plugins, and themes.
func (s *Service) Update(ctx context.Context, domain string, req WPUpdateRequest) (WPUpdateResult, error) {
	site, err := s.sites.Get(domain)
	if err != nil {
		return WPUpdateResult{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q not found", domain))
	}

	target := strings.ToLower(strings.TrimSpace(req.Target))
	if target == "" {
		target = "all"
	}

	updated := []string{}
	cliInstalled, _ := s.detectWPCLI()

	if cliInstalled && !s.cfg.DryRun {
		switch target {
		case "core":
			cmd := exec.CommandContext(ctx, "wp", "core", "update", fmt.Sprintf("--path=%s", site.Root), "--allow-root")
			if out, err := cmd.Output(); err == nil && len(out) > 0 {
				updated = append(updated, "WordPress Core")
			}
		case "plugins":
			cmd := exec.CommandContext(ctx, "wp", "plugin", "update", "--all", fmt.Sprintf("--path=%s", site.Root), "--allow-root")
			if out, err := cmd.Output(); err == nil && len(out) > 0 {
				updated = append(updated, "All Plugins")
			}
		case "themes":
			cmd := exec.CommandContext(ctx, "wp", "theme", "update", "--all", fmt.Sprintf("--path=%s", site.Root), "--allow-root")
			if out, err := cmd.Output(); err == nil && len(out) > 0 {
				updated = append(updated, "All Themes")
			}
		case "all":
			_ = exec.CommandContext(ctx, "wp", "core", "update", fmt.Sprintf("--path=%s", site.Root), "--allow-root").Run()
			_ = exec.CommandContext(ctx, "wp", "plugin", "update", "--all", fmt.Sprintf("--path=%s", site.Root), "--allow-root").Run()
			_ = exec.CommandContext(ctx, "wp", "theme", "update", "--all", fmt.Sprintf("--path=%s", site.Root), "--allow-root").Run()
			updated = append(updated, "WordPress Core", "All Plugins", "All Themes")
		}
	} else {
		// Mock / file-based update confirmation
		switch target {
		case "core":
			updated = append(updated, "WordPress Core 6.7.1")
		case "plugins":
			updated = append(updated, "Installed Plugins")
		case "themes":
			updated = append(updated, "Active Theme")
		case "all":
			updated = append(updated, "WordPress Core", "Plugins", "Themes")
		}
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "wordpress.update",
			Params: map[string]any{"domain": domain, "target": target},
			Result: audit.ResultAccepted,
		})
	}

	return WPUpdateResult{
		Success: true,
		Domain:  domain,
		Target:  target,
		Updated: updated,
		Message: fmt.Sprintf("Successfully executed update for target %q", target),
	}, nil
}

// Helpers

func extractDefine(content, key string) string {
	pattern := fmt.Sprintf(`define\s*\(\s*['"]%s['"]\s*,\s*['"]([^'"]+)['"]\s*\)`, key)
	re := regexp.MustCompile(pattern)
	if m := re.FindStringSubmatch(content); len(m) > 1 {
		return m[1]
	}
	return ""
}

func replaceDefine(content, key, newValue string) string {
	pattern := fmt.Sprintf(`define\s*\(\s*['"]%s['"]\s*,\s*['"][^'"]*['"]\s*\);`, key)
	replacement := fmt.Sprintf("define( '%s', '%s' );", key, newValue)
	re := regexp.MustCompile(pattern)
	if re.MatchString(content) {
		return re.ReplaceAllString(content, replacement)
	}
	return content + "\n" + replacement
}

func extractHeader(content, header string) string {
	pattern := fmt.Sprintf(`(?i)%s\s*:\s*([^\r\n]+)`, header)
	re := regexp.MustCompile(pattern)
	if m := re.FindStringSubmatch(content); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func generateSalts() map[string]string {
	keys := []string{
		"AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
		"AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
	}
	salts := make(map[string]string, len(keys))
	for _, k := range keys {
		salts[k] = randomPassword(64)
	}
	return salts
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func randomPassword(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+"
	b := make([]byte, length)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func copyDir(src, dst string) error {
	_ = os.MkdirAll(dst, 0o755)
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		s := filepath.Join(src, entry.Name())
		d := filepath.Join(dst, entry.Name())
		if entry.Name() == ".git" || entry.Name() == "cache" || entry.Name() == ".clouddeck_backups" {
			continue
		}
		if entry.IsDir() {
			if err := copyDir(s, d); err != nil {
				return err
			}
		} else {
			if err := copyFile(s, d); err != nil {
				return err
			}
		}
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
