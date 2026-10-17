// Package config loads agent configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds the resolved agent settings.
type Config struct {
	Listen        string
	StateDir      string
	NginxSitesDir string
	Webroot       string
	PHPBase       string
	LogDir        string
	PHPFpmSock    string
	MySQLBin      string
	MySQLRootUser string
	MySQLRootPass string
	MySQLHost     string
	MySQLPort     string
	DryRun        bool
}

// Load reads the environment and applies documented defaults.
func Load() (Config, error) {
	cfg := Config{
		Listen:        env("AGENT_LISTEN", "127.0.0.1:9090"),
		StateDir:      env("AGENT_STATE_DIR", "./data"),
		NginxSitesDir: env("AGENT_NGINX_SITES_DIR", "/etc/nginx/conf.d"),
		Webroot:       env("AGENT_WEBROOT", "/www/wwwroot"),
		PHPBase:       env("AGENT_PHP_BASE", "/etc/php"),
		LogDir:        env("AGENT_LOG_DIR", "/var/log/nginx"),
		PHPFpmSock:    env("AGENT_PHP_FPM_SOCK", "/run/php/php{{version}}-fpm.sock"),
		MySQLBin:      env("AGENT_MYSQL_BIN", "mysql"),
		MySQLRootUser: env("AGENT_MYSQL_ROOT_USER", "root"),
		MySQLRootPass: env("AGENT_MYSQL_ROOT_PASSWORD", ""),
		MySQLHost:     env("AGENT_MYSQL_HOST", ""),
		MySQLPort:     env("AGENT_MYSQL_PORT", ""),
	}
	if raw := strings.TrimSpace(os.Getenv("AGENT_DRY_RUN")); raw != "" {
		dryRun, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("AGENT_DRY_RUN: %q is not a boolean", raw)
		}
		cfg.DryRun = dryRun
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
