// Package config loads agent configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"path/filepath"
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

	// v0.3 monitoring / service control
	NginxRestartCmd  string
	MySQLRestartCmd  string
	PHPFpmRestartCmd string

	// v0.3 DNS (PowerDNS via pdnsutil)
	PdnsUtilBin    string
	PdnsConfDir    string
	PdnsControlBin string

	// v0.3 backups
	BackupDir        string
	RcloneBin        string
	MySQLDumpBin     string
	TelegramBotToken string
	TelegramChatID   string
	TelegramAPI      string

	// v0.4 mail (file-backed; point these at the real MTA/Dovecot files)
	MailRoot         string // AGENT_MAIL_ROOT
	MailDomainsFile  string // AGENT_MAIL_DOMAINS_FILE
	MailUsersFile    string // AGENT_MAIL_USERS_FILE
	MailAliasesFile  string // AGENT_MAIL_ALIASES_FILE
	MailAutoreplyDir string // AGENT_MAIL_AUTOREPLY_DIR
	MailDkimDir      string // AGENT_MAIL_DKIM_DIR
	MailVhostsDir    string // AGENT_MAIL_VHOSTS_DIR
	MailReloadCmd    string // AGENT_MAIL_RELOAD_CMD (full argv, space-separated; empty = no reload)
	MailHostname     string // AGENT_MAIL_HOSTNAME (used as MX target)

	// v0.4 site operations
	PHPSockMap string // AGENT_PHP_SOCK_MAP: "8.3=/tmp/php-cgi-83.sock,8.4=/tmp/php-cgi-84.sock"
	CronDir    string // AGENT_CRON_DIR (site cron fragments)

	// v0.5 FTP accounts (pure-ftpd passwd file)
	FTPPasswdFile string // AGENT_FTP_PASSWD_FILE
	FTPRunAs      string // AGENT_FTP_RUNAS (unix user owning FTP home dirs)
	FTPReloadCmd  string // AGENT_FTP_RELOAD_CMD (e.g. pure-pw mkdb)

	// v0.5 web terminal
	TermUser  string // AGENT_TERM_USER (unix user the shell runs as)
	TermShell string // AGENT_TERM_SHELL

	// v0.5 SSH key management
	SSHKeysFile  string // AGENT_SSH_KEYS_FILE (authorized_keys)
	SSHKeyDir    string // AGENT_SSH_KEY_DIR (generated keypairs)
	SSHConfig    string // AGENT_SSH_CONFIG (sshd_config, for the Port)
	SSHKeygenBin string // AGENT_SSH_KEYGEN_BIN

	// v0.5 phpMyAdmin + WAF
	PHPMYADMINDir string // AGENT_PHPMYADMIN_DIR (aaPanel-style install root)
	NginxBin      string // AGENT_NGINX_BIN (used for -V module detection)
	ModsecConf    string // AGENT_MODSEC_CONF (rules file when the module exists)
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

		NginxRestartCmd:  env("AGENT_NGINX_RESTART_CMD", ""),
		MySQLRestartCmd:  env("AGENT_MYSQL_RESTART_CMD", ""),
		PHPFpmRestartCmd: env("AGENT_PHP_FPM_RESTART_CMD", ""),

		PdnsUtilBin:    env("AGENT_PDNSUTIL_BIN", "pdnsutil"),
		PdnsConfDir:    env("AGENT_PDNS_CONF_DIR", "/etc/powerdns"),
		PdnsControlBin: env("AGENT_PDNS_CONTROL_BIN", "pdns_control"),

		BackupDir:        env("AGENT_BACKUP_DIR", "/var/lib/clouddeck/backups"),
		RcloneBin:        env("AGENT_RCLONE_BIN", "rclone"),
		MySQLDumpBin:     env("AGENT_MYSQLDUMP_BIN", "mysqldump"),
		TelegramBotToken: env("AGENT_TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:   env("AGENT_TELEGRAM_CHAT_ID", ""),
		TelegramAPI:      env("AGENT_TELEGRAM_API", "https://api.telegram.org"),
	}

	// v0.4 mail: defaults derive from AGENT_MAIL_ROOT (which itself defaults
	// under the state dir), so one env var relocates the whole mail state.
	mailRoot := env("AGENT_MAIL_ROOT", filepath.Join(cfg.StateDir, "mail"))
	cfg.MailRoot = mailRoot
	cfg.MailDomainsFile = env("AGENT_MAIL_DOMAINS_FILE", filepath.Join(mailRoot, "domains"))
	cfg.MailUsersFile = env("AGENT_MAIL_USERS_FILE", filepath.Join(mailRoot, "users"))
	cfg.MailAliasesFile = env("AGENT_MAIL_ALIASES_FILE", filepath.Join(mailRoot, "aliases"))
	cfg.MailAutoreplyDir = env("AGENT_MAIL_AUTOREPLY_DIR", filepath.Join(mailRoot, "autoreply"))
	cfg.MailDkimDir = env("AGENT_MAIL_DKIM_DIR", filepath.Join(mailRoot, "dkim"))
	cfg.MailVhostsDir = env("AGENT_MAIL_VHOSTS_DIR", filepath.Join(mailRoot, "vhosts"))
	cfg.MailReloadCmd = env("AGENT_MAIL_RELOAD_CMD", "")
	host, _ := os.Hostname()
	cfg.MailHostname = env("AGENT_MAIL_HOSTNAME", host)

	// v0.4 site operations
	cfg.PHPSockMap = env("AGENT_PHP_SOCK_MAP", "")
	cfg.CronDir = env("AGENT_CRON_DIR", "/etc/cron.d")

	// v0.5 FTP accounts
	cfg.FTPPasswdFile = env("AGENT_FTP_PASSWD_FILE", filepath.Join(cfg.StateDir, "ftp", "passwd"))
	cfg.FTPRunAs = env("AGENT_FTP_RUNAS", "www")
	cfg.FTPReloadCmd = env("AGENT_FTP_RELOAD_CMD", "")

	// v0.5 web terminal
	cfg.TermUser = env("AGENT_TERM_USER", "root")
	cfg.TermShell = env("AGENT_TERM_SHELL", "/bin/bash")

	// v0.5 SSH key management
	cfg.SSHKeysFile = env("AGENT_SSH_KEYS_FILE", "/root/.ssh/authorized_keys")
	cfg.SSHKeyDir = env("AGENT_SSH_KEY_DIR", "/root/.ssh/clouddeck-keys")
	cfg.SSHConfig = env("AGENT_SSH_CONFIG", "/etc/ssh/sshd_config")
	cfg.SSHKeygenBin = env("AGENT_SSH_KEYGEN_BIN", "ssh-keygen")

	// v0.5 phpMyAdmin + WAF
	cfg.PHPMYADMINDir = env("AGENT_PHPMYADMIN_DIR", "/www/server/phpmyadmin")
	cfg.NginxBin = env("AGENT_NGINX_BIN", "nginx")
	cfg.ModsecConf = env("AGENT_MODSEC_CONF", "/etc/nginx/modsec/clouddeck.conf")

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
