// Runtime installation: curated Node.js and PHP versions can be installed
// from the panel without touching the shell by hand. Node comes from the
// official nodejs.org tarballs (verified against SHASUMS256.txt), PHP from
// apt with the ondrej PPA added when the requested version is not in the
// base repositories. Install destinations double as discovery locations, so
// a finished install shows up in GET /v1/runtimes without extra wiring.
package runtimes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/tasks"
)

// Installable lists the curated versions offered for one-click install.
func Installable() map[string][]string {
	return map[string][]string{
		KindNode: {"20", "22", "24"},
		KindPHP:  {"8.1", "8.2", "8.3", "8.4"},
	}
}

const (
	actionRuntimeInstall   = "runtime.install"
	actionRuntimeUninstall = "runtime.uninstall"
	nodeDistBase           = "https://nodejs.org/dist"
	downloadTimeout        = 10 * time.Minute
	installTimeout         = 20 * time.Minute
)

var (
	nodeMajorRe   = regexp.MustCompile(`^\d{1,2}$`)
	nodeVersionRe = regexp.MustCompile(`^\d{1,2}(?:\.\d{1,2}\.\d{1,2})?$`)
	phpVersionRe  = regexp.MustCompile(`^\d{1,2}\.\d{1,2}$`)
)

// installPHPScript is agent-owned; the requested version arrives as $1.
const installPHPScript = `set -e
export DEBIAN_FRONTEND=noninteractive
if ! apt-cache show "php$1-fpm" >/dev/null 2>&1; then
	apt-get update -qq
	apt-get install -y -qq software-properties-common gpg-agent
	add-apt-repository -y ppa:ondrej/php
	apt-get update -qq
fi
apt-get install -y -qq "php$1-fpm" "php$1-cli" "php$1-mysql" "php$1-curl" "php$1-gd" "php$1-mbstring" "php$1-xml" "php$1-zip" "php$1-intl" "php$1-bcmath"
systemctl enable --now "php$1-fpm"
`

// uninstallPHPScript purges every package for one PHP branch; $1 is the
// version. The directory removal is a safety net for leftover config.
const uninstallPHPScript = `set -e
export DEBIAN_FRONTEND=noninteractive
systemctl disable --now "php$1-fpm" >/dev/null 2>&1 || true
apt-get purge -y "php$1-*"
apt-get autoremove -y -qq
rm -rf "/etc/php/$1"
`

// Installer performs runtime installs. AGENT_NODE_INSTALL_CMD /
// AGENT_PHP_INSTALL_CMD replace the built-in flows (sandboxed E2E and
// offline mirrors); the exact version is appended as the last argument.
type Installer struct {
	cfg   config.Config
	audit *audit.Log
}

// NewInstaller creates the installer.
func NewInstaller(cfg config.Config, auditLog *audit.Log) *Installer {
	return &Installer{cfg: cfg, audit: auditLog}
}

// Installed reports whether the requested version already exists on the
// host. Node accepts a major ("24") or an exact version ("24.22.1"). The API
// handlers use it to reject re-installs and missing uninstalls synchronously
// instead of after a task has started.
func (i *Installer) Installed(kind, version string) bool {
	switch kind {
	case KindNode:
		_, ok := nodeDirFor(version)
		return ok
	case KindPHP:
		return i.phpInstalled(version)
	}
	return false
}

// Validate checks kind/version without running anything, so the API handler
// can reject bad input before a task is created.
func (i *Installer) Validate(kind, version string) error {
	if kind != KindNode && kind != KindPHP {
		return apierr.BadRequest("invalid_kind", "only node and php can be installed")
	}
	if kind == KindNode && !nodeMajorRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", "node version must be a major like 20, 22 or 24")
	}
	if kind == KindPHP && !phpVersionRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", "php version must look like 8.2")
	}
	return nil
}

// ValidateUninstall is Validate plus exact Node versions, which is what the
// runtime list reports ("24.22.1").
func (i *Installer) ValidateUninstall(kind, version string) error {
	if kind != KindNode && kind != KindPHP {
		return apierr.BadRequest("invalid_kind", "only node and php can be uninstalled")
	}
	if kind == KindNode && !nodeVersionRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", "node version must be a major or an exact version like 24.22.1")
	}
	if kind == KindPHP && !phpVersionRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", "php version must look like 8.2")
	}
	return nil
}

// Uninstall removes one runtime. Errors: 400 invalid_kind/invalid_version,
// 404 not_installed, 409 dry_run, 502 uninstall_failed.
func (i *Installer) Uninstall(ctx context.Context, log tasks.LogFunc, kind, version string) error {
	if i.cfg.DryRun {
		return apierr.Conflict("dry_run", "runtime uninstalls are disabled in dry-run mode")
	}
	if err := i.ValidateUninstall(kind, version); err != nil {
		return err
	}
	if !i.Installed(kind, version) {
		return apierr.NotFound("not_installed", fmt.Sprintf("%s %s is not installed", kind, version))
	}
	if err := i.audit.Append(audit.Record{
		Action: actionRuntimeUninstall,
		Params: map[string]any{"kind": kind, "version": version},
		Result: audit.ResultAccepted,
	}); err != nil {
		return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if kind == KindNode {
		return i.uninstallNode(ctx, log, version)
	}
	return i.uninstallPHP(ctx, log, version)
}

func (i *Installer) uninstallNode(ctx context.Context, log tasks.LogFunc, version string) error {
	dir, ok := nodeDirFor(version)
	if !ok {
		return apierr.NotFound("not_installed", fmt.Sprintf("node %s is not installed", version))
	}
	exact := strings.TrimPrefix(filepath.Base(dir), "v")
	if fields := strings.Fields(i.cfg.NodeUninstallCmd); len(fields) > 0 {
		args := append(slices.Clone(fields), exact)
		return uninstallFailed(safeexec.RunTimeout(ctx, false, log, installTimeout, args[0], args[1:]...))
	}
	if err := os.RemoveAll(dir); err != nil {
		return apierr.New(502, "uninstall_failed", fmt.Sprintf("remove %s: %v", dir, err))
	}
	log("info", "removed node "+exact+" from "+dir)
	return nil
}

func (i *Installer) uninstallPHP(ctx context.Context, log tasks.LogFunc, version string) error {
	if fields := strings.Fields(i.cfg.PHPUninstallCmd); len(fields) > 0 {
		args := append(slices.Clone(fields), version)
		return uninstallFailed(safeexec.RunTimeout(ctx, false, log, installTimeout, args[0], args[1:]...))
	}
	if err := safeexec.RunTimeout(ctx, false, log, installTimeout,
		"bash", "-c", uninstallPHPScript, "clouddeck-uninstall-php", version); err != nil {
		return uninstallFailed(err)
	}
	if i.phpInstalled(version) {
		return apierr.New(502, "uninstall_failed", fmt.Sprintf("php %s is still present after the package purge", version))
	}
	log("info", "uninstalled php "+version)
	return nil
}

// Install installs one runtime. Errors: 400 invalid_kind/invalid_version,
// 409 dry_run/already_installed, 502 install_failed.
func (i *Installer) Install(ctx context.Context, log tasks.LogFunc, kind, version string) error {
	if i.cfg.DryRun {
		return apierr.Conflict("dry_run", "runtime installs are disabled in dry-run mode")
	}
	if err := i.Validate(kind, version); err != nil {
		return err
	}
	if err := i.audit.Append(audit.Record{
		Action: actionRuntimeInstall,
		Params: map[string]any{"kind": kind, "version": version},
		Result: audit.ResultAccepted,
	}); err != nil {
		return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if kind == KindNode {
		return i.installNode(ctx, log, version)
	}
	return i.installPHP(ctx, log, version)
}

func (i *Installer) installNode(ctx context.Context, log tasks.LogFunc, major string) error {
	if existing := installedNodeMajor(major); existing != "" {
		return apierr.Conflict("already_installed", fmt.Sprintf("node %s is already installed (%s)", major, existing))
	}
	if fields := strings.Fields(i.cfg.NodeInstallCmd); len(fields) > 0 {
		args := append(slices.Clone(fields), major)
		return installFailed(safeexec.RunTimeout(ctx, false, log, installTimeout, args[0], args[1:]...))
	}

	version, err := latestNodeVersion(major)
	if err != nil {
		return apierr.New(502, "install_failed", fmt.Sprintf("could not resolve the latest node %s release: %v", major, err))
	}
	archive, err := downloadNodeDist(ctx, log, version)
	if err != nil {
		return apierr.New(502, "install_failed", err.Error())
	}
	defer os.Remove(archive)

	dest := filepath.Join("/opt/nodejs", "v"+version)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return apierr.New(502, "install_failed", fmt.Sprintf("create %s: %v", dest, err))
	}
	if err := safeexec.RunTimeout(ctx, false, log, downloadTimeout,
		"tar", "-xJf", archive, "-C", dest, "--strip-components=1"); err != nil {
		os.RemoveAll(dest)
		return installFailed(err)
	}
	if err := safeexec.RunTimeout(ctx, false, log, time.Minute,
		filepath.Join(dest, "bin", "node"), "-v"); err != nil {
		os.RemoveAll(dest)
		return installFailed(err)
	}
	log("info", "installed node "+version+" in "+dest)
	return nil
}

func (i *Installer) installPHP(ctx context.Context, log tasks.LogFunc, version string) error {
	if slices.Contains(phpVersions(), version) {
		return apierr.Conflict("already_installed", fmt.Sprintf("php %s is already installed", version))
	}
	if fields := strings.Fields(i.cfg.PHPInstallCmd); len(fields) > 0 {
		args := append(slices.Clone(fields), version)
		if err := safeexec.RunTimeout(ctx, false, log, installTimeout, args[0], args[1:]...); err != nil {
			return installFailed(err)
		}
	} else {
		if err := safeexec.RunTimeout(ctx, false, log, installTimeout,
			"bash", "-c", installPHPScript, "clouddeck-install-php", version); err != nil {
			return installFailed(err)
		}
		// Only the built-in apt flow is expected to register the version
		// under /etc/php; custom install commands may stage it elsewhere.
		if !slices.Contains(phpVersions(), version) {
			return apierr.New(502, "install_failed", fmt.Sprintf("php %s was installed but is not discoverable under /etc/php", version))
		}
	}
	log("info", "installed php "+version)
	return nil
}

// installedNodeMajor returns the exact version installed under
// /opt/nodejs/v<something starting with major>, or "".
func installedNodeMajor(major string) string {
	entries, err := os.ReadDir("/opt/nodejs")
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && strings.HasPrefix(name, "v"+major+".") &&
			isExecutable(filepath.Join("/opt/nodejs", name, "bin", "node")) {
			return strings.TrimPrefix(name, "v")
		}
	}
	return ""
}

// nodeDirFor resolves a major or exact version to its install directory.
func nodeDirFor(version string) (string, bool) {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	if version == "" {
		return "", false
	}
	if !strings.Contains(version, ".") {
		resolved := installedNodeMajor(version)
		if resolved == "" {
			return "", false
		}
		version = resolved
	}
	dir := filepath.Join("/opt/nodejs", "v"+version)
	return dir, isExecutable(filepath.Join(dir, "bin", "node"))
}

// phpInstalled checks both the host PHP dirs and the configured base (the
// sandbox points AGENT_PHP_BASE elsewhere).
func (i *Installer) phpInstalled(version string) bool {
	if slices.Contains(phpVersions(), version) {
		return true
	}
	if i.cfg.PHPBase == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(i.cfg.PHPBase, version))
	return err == nil && info.IsDir()
}

// latestNodeVersion resolves the newest nodejs.org release for a major.
func latestNodeVersion(major string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(nodeDistBase + "/index.json")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("nodejs.org returned HTTP %d", resp.StatusCode)
	}
	var releases []struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return "", err
	}
	prefix := "v" + major + "."
	for _, release := range releases {
		if strings.HasPrefix(release.Version, prefix) {
			return strings.TrimPrefix(release.Version, "v"), nil
		}
	}
	return "", fmt.Errorf("no release found for major %s", major)
}

// downloadNodeDist fetches the official tarball plus SHASUMS256.txt and
// verifies the archive before it is extracted anywhere.
func downloadNodeDist(ctx context.Context, log tasks.LogFunc, version string) (string, error) {
	arch := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	if arch == "" {
		return "", fmt.Errorf("no official node build for %s", runtime.GOARCH)
	}
	name := fmt.Sprintf("node-v%s-linux-%s.tar.xz", version, arch)
	url := nodeDistBase + "/v" + version + "/" + name

	sums, err := fetchText(ctx, nodeDistBase+"/v"+version+"/SHASUMS256.txt")
	if err != nil {
		return "", fmt.Errorf("fetch SHASUMS256.txt: %v", err)
	}
	want := ""
	for _, line := range strings.Split(sums, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == name {
			want = fields[0]
			break
		}
	}
	if want == "" {
		return "", fmt.Errorf("SHASUMS256.txt has no entry for %s", name)
	}

	client := &http.Client{Timeout: downloadTimeout}
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("download %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download %s: HTTP %d", url, resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "clouddeck-node-*.tar.xz")
	if err != nil {
		return "", fmt.Errorf("temp file: %v", err)
	}
	defer tmp.Close()

	hash := sha256.New()
	counter := &countingWriter{log: log, total: resp.ContentLength}
	if _, err := io.Copy(io.MultiWriter(tmp, hash, counter), resp.Body); err != nil {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("download %s: %v", url, err)
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != want {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("checksum mismatch for %s: got %s, want %s", name, got, want)
	}
	log("info", "verified "+name+" against SHASUMS256.txt")
	return tmp.Name(), nil
}

func fetchText(ctx context.Context, url string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

type countingWriter struct {
	log     tasks.LogFunc
	total   int64
	written int64
	nextLog int64
}

func (w *countingWriter) Write(p []byte) (int, error) {
	w.written += int64(len(p))
	if w.total > 0 && w.written >= w.nextLog {
		w.log("info", fmt.Sprintf("downloaded %d MB of %d MB", w.written/(1<<20), w.total/(1<<20)))
		w.nextLog = w.written + 10<<20
	}
	return len(p), nil
}

func installFailed(err error) error {
	if err == nil {
		return nil
	}
	if apiErr, ok := apierr.As(err); ok {
		return apiErr
	}
	return apierr.New(502, "install_failed", err.Error())
}

func uninstallFailed(err error) error {
	if err == nil {
		return nil
	}
	if apiErr, ok := apierr.As(err); ok {
		return apiErr
	}
	return apierr.New(502, "uninstall_failed", err.Error())
}
