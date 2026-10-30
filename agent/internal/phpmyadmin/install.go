package phpmyadmin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/runas"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/tasks"
)

// The installer mirrors runtimes.Install: it resolves the current official
// release, verifies the tarball against its published SHA-256, then writes an
// aaPanel-style layout that Status already detects and runs it as a systemd
// unit.
const (
	pmaUnitName    = "clouddeck-phpmyadmin.service"
	pmaUser        = "clouddeck_pma"
	versionTimeout = 30 * time.Second
	archiveTimeout = 10 * time.Minute
	startTimeout   = time.Minute
	readyTimeout   = 20 * time.Second
)

var (
	releaseVersionRe = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
	sha256Re         = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// dbCredentials is stored next to the phpMyAdmin state so panel auto-login
// works on hosts whose MySQL root only accepts unix_socket authentication.
type dbCredentials struct {
	User     string `json:"user"`
	Password string `json:"password"`
}

// Install fetches and configures the latest phpMyAdmin release. Errors:
// 409 dry_run/already_installed, 502 install_failed.
func (s *Service) Install(ctx context.Context, log tasks.LogFunc, auditLog *audit.Log) error {
	if s.cfg.DryRun {
		return apierr.Conflict("dry_run", "phpMyAdmin installs are disabled in dry-run mode")
	}
	if s.Status().Installed {
		return apierr.Conflict("already_installed", "phpMyAdmin is already installed")
	}
	phpBin := s.phpBinaryPath()
	if _, err := exec.LookPath(phpBin); err != nil {
		return installFailed(fmt.Sprintf("PHP CLI %q is not installed on this server; install php-cli first", s.cfg.PHPMYADMINPHPBin))
	}
	if auditLog != nil {
		if err := auditLog.Append(audit.Record{
			Action: "phpmyadmin.install",
			Result: audit.ResultAccepted,
		}); err != nil {
			return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
		}
	}

	version, err := s.latestVersion(ctx)
	if err != nil {
		return installFailed(fmt.Sprintf("resolve the latest release: %v", err))
	}
	log("info", "latest phpMyAdmin release is "+version)

	archive, sum, err := s.download(ctx, version)
	if err != nil {
		return installFailed(err.Error())
	}
	defer os.Remove(archive)

	root := s.cfg.PHPMYADMINDir
	if err := os.MkdirAll(root, 0o755); err != nil {
		return installFailed(fmt.Sprintf("create %s: %v", root, err))
	}
	staging, err := os.MkdirTemp(root, ".phpmyadmin-*")
	if err != nil {
		return installFailed(fmt.Sprintf("create staging directory: %v", err))
	}
	defer os.RemoveAll(staging)
	if err := safeexec.RunTimeout(ctx, false, log, archiveTimeout,
		"tar", "-xzf", archive, "-C", staging, "--no-same-owner"); err != nil {
		return installFailed(err.Error())
	}
	src, err := singleTopDir(staging)
	if err != nil {
		return installFailed(err.Error())
	}

	webName := webDirPrefix + sum[:12]
	webDir := filepath.Join(root, webName)
	if err := os.RemoveAll(webDir); err != nil {
		return installFailed(fmt.Sprintf("remove %s: %v", webDir, err))
	}
	if err := os.Rename(src, webDir); err != nil {
		return installFailed(fmt.Sprintf("move phpMyAdmin into %s: %v", webDir, err))
	}

	stateDir := s.cfg.PHPMYADMINStateDir
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return installFailed(fmt.Sprintf("create %s: %v", stateDir, err))
	}
	// Ensure parent directory (e.g. /var/lib/clouddeck) has traversal permission so the service user can reach stateDir
	if parent := filepath.Dir(stateDir); parent != "" && parent != "/" {
		_ = os.Chmod(parent, 0o755)
	}
	for _, sub := range []string{"tmp", "sessions"} {
		subDir := filepath.Join(stateDir, sub)
		if err := os.MkdirAll(subDir, 0o775); err != nil {
			return installFailed(fmt.Sprintf("create %s: %v", subDir, err))
		}
		_ = os.Chmod(subDir, 0o775)
	}
	if err := chownTree(stateDir, s.cfg.PHPMYADMINRunAs); err != nil {
		return installFailed(err.Error())
	}

	secret, err := randomHex(32)
	if err != nil {
		return installFailed(fmt.Sprintf("generate blowfish secret: %v", err))
	}
	if err := os.WriteFile(filepath.Join(webDir, "config.inc.php"), []byte(s.configPHP(secret)), 0o644); err != nil {
		return installFailed(fmt.Sprintf("write config.inc.php: %v", err))
	}

	// Best effort: root@localhost commonly only accepts unix_socket on MariaDB,
	// so phpMyAdmin gets its own password account for panel auto-login.
	s.ensureDBUser(ctx, log)

	port, err := s.choosePort()
	if err != nil {
		return installFailed(err.Error())
	}
	unit := s.renderUnit(webDir, port)
	if err := os.MkdirAll(s.cfg.PHPMYADMINUnitDir, 0o755); err != nil {
		return installFailed(fmt.Sprintf("create unit directory: %v", err))
	}
	if err := os.WriteFile(filepath.Join(s.cfg.PHPMYADMINUnitDir, pmaUnitName), []byte(unit), 0o644); err != nil {
		return installFailed(fmt.Sprintf("write %s: %v", pmaUnitName, err))
	}
	if err := safeexec.RunTimeout(ctx, false, log, startTimeout, "systemctl", "daemon-reload"); err != nil {
		return installFailed(err.Error())
	}
	if err := safeexec.RunTimeout(ctx, false, log, startTimeout, "systemctl", "enable", pmaUnitName); err != nil {
		return installFailed(err.Error())
	}
	if err := safeexec.RunTimeout(ctx, false, log, startTimeout, "systemctl", "restart", pmaUnitName); err != nil {
		return installFailed(err.Error())
	}

	// Best-effort firewall rule: if UFW or firewalld is active, open the port so
	// operators can reach phpMyAdmin from the browser.
	if _, err := exec.LookPath("ufw"); err == nil {
		_ = safeexec.RunTimeout(ctx, false, log, startTimeout, "ufw", "allow", fmt.Sprintf("%d/tcp", port), "comment", "CloudDeck phpMyAdmin")
	} else if _, err := exec.LookPath("firewall-cmd"); err == nil {
		_ = safeexec.RunTimeout(ctx, false, log, startTimeout, "firewall-cmd", "--add-port="+fmt.Sprintf("%d/tcp", port), "--permanent")
		_ = safeexec.RunTimeout(ctx, false, log, startTimeout, "firewall-cmd", "--reload")
	}

	urlPath := "/" + webName + "/"
	if err := waitReady(ctx, port, urlPath); err != nil {
		// Do not leave a broken unit restart-looping; without port.pl the panel
		// keeps showing the Install button.
		_ = safeexec.RunTimeout(ctx, false, log, startTimeout, "systemctl", "disable", "--now", pmaUnitName)
		return installFailed(fmt.Sprintf("phpMyAdmin did not answer on port %d: %v", port, err))
	}

	// Only the new directory may remain so detection cannot pick an old copy.
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.HasPrefix(entry.Name(), webDirPrefix) && entry.Name() != webName {
				_ = os.RemoveAll(filepath.Join(root, entry.Name()))
			}
		}
	}
	if err := os.WriteFile(filepath.Join(root, "port.pl"), []byte(strconv.Itoa(port)+"\n"), 0o644); err != nil {
		return installFailed(fmt.Sprintf("write port.pl: %v", err))
	}
	if err := os.WriteFile(filepath.Join(root, "version.pl"), []byte(version+"\n"), 0o644); err != nil {
		return installFailed(fmt.Sprintf("write version.pl: %v", err))
	}

	log("info", fmt.Sprintf("installed phpMyAdmin %s on port %d", version, port))
	return nil
}

// latestVersion reads the official release feed.
func (s *Service) latestVersion(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.PHPMYADMINVersionURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := (&http.Client{Timeout: versionTimeout}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("version feed returned HTTP %d", resp.StatusCode)
	}
	var release struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&release); err != nil {
		return "", err
	}
	if !releaseVersionRe.MatchString(release.Version) {
		return "", fmt.Errorf("version feed returned %q", release.Version)
	}
	return release.Version, nil
}

// download fetches the release tarball and verifies its published SHA-256.
func (s *Service) download(ctx context.Context, version string) (string, string, error) {
	name := fmt.Sprintf("phpMyAdmin-%s-all-languages.tar.gz", version)
	url := strings.TrimRight(s.cfg.PHPMYADMINDistBase, "/") + "/" + version + "/" + name

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url+".sha256", nil)
	if err != nil {
		return "", "", err
	}
	resp, err := (&http.Client{Timeout: versionTimeout}).Do(req)
	if err != nil {
		return "", "", fmt.Errorf("fetch checksum: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("checksum sidecar returned HTTP %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return "", "", fmt.Errorf("read checksum: %v", err)
	}
	fields := strings.Fields(string(raw))
	if len(fields) == 0 || !sha256Re.MatchString(fields[0]) {
		return "", "", fmt.Errorf("checksum sidecar is malformed")
	}
	want := fields[0]

	req, err = http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", "", err
	}
	resp, err = (&http.Client{Timeout: archiveTimeout}).Do(req)
	if err != nil {
		return "", "", fmt.Errorf("download %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("download %s: HTTP %d", url, resp.StatusCode)
	}
	tmp, err := os.CreateTemp("", "clouddeck-phpmyadmin-*.tar.gz")
	if err != nil {
		return "", "", fmt.Errorf("temp file: %v", err)
	}
	defer tmp.Close()

	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, hash), resp.Body); err != nil {
		os.Remove(tmp.Name())
		return "", "", fmt.Errorf("download %s: %v", url, err)
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != want {
		os.Remove(tmp.Name())
		return "", "", fmt.Errorf("checksum mismatch: got %s, want %s", got, want)
	}
	return tmp.Name(), want, nil
}

// singleTopDir returns the one directory an extracted release contains.
func singleTopDir(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", err
	}
	var visible []os.DirEntry
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".") {
			visible = append(visible, entry)
		}
	}
	if len(visible) != 1 || !visible[0].IsDir() {
		return "", fmt.Errorf("release archive must contain exactly one top-level directory")
	}
	return filepath.Join(dir, visible[0].Name()), nil
}

// choosePort honors AGENT_PHPMYADMIN_PORT or reserves an ephemeral port.
func (s *Service) choosePort() (int, error) {
	if s.cfg.PHPMYADMINPort > 0 {
		return s.cfg.PHPMYADMINPort, nil
	}
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return 0, fmt.Errorf("pick a port: %v", err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

// phpBinaryPath returns the absolute path to the configured PHP CLI binary if
// available, or the configured name.
func (s *Service) phpBinaryPath() string {
	bin := s.cfg.PHPMYADMINPHPBin
	if filepath.IsAbs(bin) {
		return bin
	}
	if path, err := exec.LookPath(bin); err == nil {
		return path
	}
	return bin
}

// readyPage reports whether the built-in server serves phpMyAdmin's login
// form. A 200 alone is not enough: PHP session/permission failures render an
// error page with the same status.
func readyPage(port int, urlPath string) bool {
	client := &http.Client{
		Timeout: probeTimeout,
	}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, urlPath))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return false
	}
	page := string(body)
	return strings.Contains(page, `name="token"`) || strings.Contains(page, `name='token'`) || strings.Contains(page, "pma_username")
}

// waitReady polls the built-in server until it serves the login form.
func waitReady(ctx context.Context, port int, urlPath string) error {
	deadline := time.Now().Add(readyTimeout)
	for {
		if readyPage(port, urlPath) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("login form did not appear within %s", readyTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// configPHP renders cookie auth against the local MySQL server. The blowfish
// secret stays on disk and phpMyAdmin uses its own session storage.
func (s *Service) configPHP(secret string) string {
	host := s.cfg.MySQLHost
	if host == "" {
		host = "localhost"
	}
	port := s.cfg.MySQLPort
	if port == "" {
		port = "3306"
	}
	return fmt.Sprintf(`<?php
$cfg['blowfish_secret'] = '%s';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['host'] = '%s';
$cfg['Servers'][$i]['port'] = '%s';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = false;
$cfg['TempDir'] = '%s';
`, phpQuote(secret), phpQuote(host), phpQuote(port), phpQuote(filepath.Join(s.cfg.PHPMYADMINStateDir, "tmp")))
}

// renderUnit runs the CLI server as a non-root user.
func (s *Service) renderUnit(webDir string, port int) string {
	stateDir := s.cfg.PHPMYADMINStateDir
	return fmt.Sprintf(`# managed-by: clouddeck
[Unit]
Description=CloudDeck phpMyAdmin
After=network.target

[Service]
Type=simple
User=%s
WorkingDirectory=%s
ExecStart=%s -d session.save_path=%s -d upload_tmp_dir=%s -d sys_temp_dir=%s -d log_errors=1 -d display_errors=0 -S 0.0.0.0:%d -t %s
Restart=on-failure
RestartSec=2
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
`, s.cfg.PHPMYADMINRunAs, webDir, s.phpBinaryPath(),
		filepath.Join(stateDir, "sessions"), filepath.Join(stateDir, "tmp"),
		filepath.Join(stateDir, "tmp"), port, s.cfg.PHPMYADMINDir)
}

// ensureDBUser creates a local password account so the panel's auto-login
// works when MySQL root only accepts unix_socket. Failure is non-fatal: the
// phpMyAdmin login page still works with any database user.
func (s *Service) ensureDBUser(ctx context.Context, log tasks.LogFunc) {
	credPath := filepath.Join(s.cfg.PHPMYADMINStateDir, "db.json")
	if _, err := os.Stat(credPath); err == nil {
		log("info", "phpMyAdmin database user already configured")
		return
	}
	if host := strings.TrimSpace(s.cfg.MySQLHost); host != "" && host != "localhost" && host != "127.0.0.1" {
		log("info", "skipping the phpMyAdmin database user: AGENT_MYSQL_HOST is remote")
		return
	}
	password, err := randomPassword(24)
	if err != nil {
		log("warn", "could not generate the phpMyAdmin database password: "+err.Error())
		return
	}
	rootUser := s.cfg.MySQLRootUser
	if rootUser == "" {
		rootUser = "root"
	}
	sql := fmt.Sprintf(`DROP USER IF EXISTS '%s'@'localhost';
CREATE USER '%s'@'localhost' IDENTIFIED BY '%s';
GRANT ALL PRIVILEGES ON *.* TO '%s'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;`, pmaUser, pmaUser, password, pmaUser)

	args := []string{"--batch", "--skip-column-names", "-u", rootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, "-e", sql)
	cmd := exec.CommandContext(ctx, s.cfg.MySQLBin, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		log("warn", fmt.Sprintf("could not create the phpMyAdmin database user (auto-login may be unavailable): %v: %s",
			err, strings.TrimSpace(string(out))))
		return
	}
	raw, err := json.Marshal(dbCredentials{User: pmaUser, Password: password})
	if err != nil {
		log("warn", "could not encode the phpMyAdmin database credentials: "+err.Error())
		return
	}
	if err := os.WriteFile(credPath, raw, 0o600); err != nil {
		log("warn", "could not store the phpMyAdmin database credentials: "+err.Error())
		return
	}
	log("info", "created the phpMyAdmin database user")
}

// loginCredentials prefers the dedicated phpMyAdmin account created at install
// time; hosts with a configured MySQL root password keep using it.
func (s *Service) loginCredentials() (string, string) {
	candidateDirs := []string{}
	if s.cfg.PHPMYADMINStateDir != "" {
		candidateDirs = append(candidateDirs, s.cfg.PHPMYADMINStateDir)
	}
	candidateDirs = append(candidateDirs, "/var/lib/clouddeck/phpmyadmin", "/var/lib/clouddeck-phpmyadmin")

	for _, dir := range candidateDirs {
		raw, err := os.ReadFile(filepath.Join(dir, "db.json"))
		if err == nil {
			var creds dbCredentials
			if json.Unmarshal(raw, &creds) == nil && creds.User != "" {
				return creds.User, creds.Password
			}
		}
	}
	user := s.cfg.MySQLRootUser
	if user == "" {
		user = "root"
	}
	return user, s.cfg.MySQLRootPass
}

// chownTree gives the service user write access to the phpMyAdmin state.
func chownTree(path, runAs string) error {
	uid, gid, err := runas.Lookup(runAs)
	if err != nil {
		return fmt.Errorf("service user %q does not exist (set AGENT_PHPMYADMIN_RUNAS): %v", runAs, err)
	}
	return filepath.Walk(path, func(item string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := os.Chown(item, uid, gid); err != nil {
			return fmt.Errorf("chown %s: %v", item, err)
		}
		return nil
	})
}

func randomHex(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func randomPassword(length int) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return string(buf), nil
}

// phpQuote escapes a value for a single-quoted PHP string.
func phpQuote(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(value, `'`, `\'`)
}

func installFailed(message string) error {
	return apierr.New(502, "install_failed", message)
}
