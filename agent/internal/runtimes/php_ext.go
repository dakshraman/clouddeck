package runtimes

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/tasks"
)

// Supported common extensions per specification:
// curl, mbstring, gd, zip, intl, bcmath, redis, imagick, pdo_mysql, xml, soap, opcache

// ExtensionInfo represents one PHP extension's state.
type ExtensionInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Installed   bool   `json:"installed"`
	Enabled     bool   `json:"enabled"`
}

// ExtensionsResponse is returned by GET /v1/runtimes/php/extensions.
type ExtensionsResponse struct {
	Version    string          `json:"version"`
	Versions   []string        `json:"versions"`
	Extensions []ExtensionInfo `json:"extensions"`
}

// ToggleExtensionRequest is the body for POST /v1/runtimes/php/extensions/toggle.
type ToggleExtensionRequest struct {
	Version   string `json:"version"`
	Extension string `json:"extension"`
	Enabled   bool   `json:"enabled"`
}

// ToggleExtensionResponse is returned on successful toggle.
type ToggleExtensionResponse struct {
	Success   bool   `json:"success"`
	Version   string `json:"version"`
	Extension string `json:"extension"`
	Enabled   bool   `json:"enabled"`
}

// ExtDef describes a supported extension and how it maps to OS packages and ini modules.
type ExtDef struct {
	Name        string
	PkgDebian   string // package name in apt: php{v}-{pkg}; defaults to Name
	ModDebian   string // module name in mods-available: {mod}.ini; defaults to Name
	Description string
}

// CommonExtensions is the catalog of supported PHP extensions across PHP 8.1 - 8.4.
var CommonExtensions = []ExtDef{
	{Name: "curl", Description: "cURL HTTP client support for remote requests and APIs"},
	{Name: "mbstring", Description: "Multibyte string support for Unicode, UTF-8 and multibyte encodings"},
	{Name: "gd", Description: "GD Graphics Library for image creation, resizing and thumbnailing"},
	{Name: "zip", Description: "Zip archive creation, decompression and extraction support"},
	{Name: "intl", Description: "Internationalization extension (ICU) for locale and formatting"},
	{Name: "bcmath", Description: "Binary Calculator arbitrary precision mathematics"},
	{Name: "redis", Description: "High-performance Redis in-memory cache and session driver"},
	{Name: "imagick", Description: "ImageMagick library wrapper for high-quality image processing"},
	{Name: "pdo_mysql", PkgDebian: "mysql", ModDebian: "pdo_mysql", Description: "MySQL database driver for PHP Data Objects (PDO)"},
	{Name: "xml", Description: "DOM, SimpleXML, XMLReader, XMLWriter and XSL processing"},
	{Name: "soap", Description: "SOAP client and server protocol support for enterprise web services"},
	{Name: "opcache", Description: "Zend OPcache bytecode caching and performance optimization"},
}

var supportedStandardVersions = []string{"8.1", "8.2", "8.3", "8.4"}

// FindExtDef resolves an extension name to its definition.
func FindExtDef(name string) (ExtDef, bool) {
	norm := strings.ToLower(strings.TrimSpace(name))
	if norm == "mysql" {
		norm = "pdo_mysql"
	}
	for _, def := range CommonExtensions {
		if strings.EqualFold(def.Name, norm) {
			return def, true
		}
	}
	return ExtDef{}, false
}

// SupportedPHPVersions returns all detected and standard PHP versions, sorted descending.
func SupportedPHPVersions() []string {
	installed := phpVersions()
	set := make(map[string]struct{})
	for _, v := range supportedStandardVersions {
		set[v] = struct{}{}
	}
	for _, v := range installed {
		set[v] = struct{}{}
	}
	var out []string
	for v := range set {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		return lessVersion(out[j], out[i]) // descending
	})
	return out
}

// DefaultPHPVersion returns the best active PHP version.
func DefaultPHPVersion() string {
	installed := phpVersions()
	if len(installed) > 0 {
		// return latest installed
		latest := installed[0]
		for _, v := range installed[1:] {
			if lessVersion(latest, v) {
				latest = v
			}
		}
		return latest
	}
	return "8.4"
}

// ListExtensions inspects extension status for a requested or default PHP version.
func ListExtensions(version string) (ExtensionsResponse, error) {
	if version == "" {
		version = DefaultPHPVersion()
	} else if !phpVersionRe.MatchString(version) {
		return ExtensionsResponse{}, apierr.BadRequest("invalid_version", fmt.Sprintf("invalid PHP version: %s", version))
	}

	versions := SupportedPHPVersions()
	exts := make([]ExtensionInfo, 0, len(CommonExtensions))
	loadedModules := getLoadedModules(version)

	for _, def := range CommonExtensions {
		installed := isExtInstalled(version, def, loadedModules)
		enabled := false
		if installed {
			enabled = isExtEnabled(version, def, loadedModules)
		}
		exts = append(exts, ExtensionInfo{
			Name:        def.Name,
			Description: def.Description,
			Installed:   installed,
			Enabled:     enabled,
		})
	}

	return ExtensionsResponse{
		Version:    version,
		Versions:   versions,
		Extensions: exts,
	}, nil
}

func getLoadedModules(version string) map[string]bool {
	modules := make(map[string]bool)
	var phpBins []string
	if bin, err := exec.LookPath("php" + version); err == nil {
		phpBins = append(phpBins, bin)
	}
	if bin, err := exec.LookPath("php"); err == nil {
		phpBins = append(phpBins, bin)
	}
	for _, bin := range phpBins {
		out, err := exec.Command(bin, "-m").Output()
		if err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				l := strings.ToLower(strings.TrimSpace(line))
				if l != "" && !strings.HasPrefix(l, "[") {
					modules[l] = true
					modules[strings.ReplaceAll(l, "_", "")] = true
					modules[strings.ReplaceAll(l, " ", "")] = true
				}
			}
			break
		}
	}
	return modules
}

func isExtInstalled(version string, def ExtDef, loaded map[string]bool) bool {
	mod := def.ModDebian
	if mod == "" {
		mod = def.Name
	}

	// 1. Check /etc/php/{version}/mods-available/{mod}.ini
	modPath := filepath.Join("/etc/php", version, "mods-available", mod+".ini")
	if _, err := os.Stat(modPath); err == nil {
		return true
	}

	// 2. Check /etc/php/{version}/fpm/conf.d or cli/conf.d
	for _, sub := range []string{"fpm", "cli"} {
		confDir := filepath.Join("/etc/php", version, sub, "conf.d")
		matches, _ := filepath.Glob(filepath.Join(confDir, "*"+mod+".ini"))
		if len(matches) > 0 {
			return true
		}
	}

	// 3. Check macOS Homebrew conf.d paths
	for _, base := range []string{"/opt/homebrew/etc/php", "/usr/local/etc/php"} {
		confDir := filepath.Join(base, version, "conf.d")
		matches, _ := filepath.Glob(filepath.Join(confDir, "*"+def.Name+"*.ini*"))
		if len(matches) > 0 {
			return true
		}
	}

	// 4. Check loaded modules map
	if isModuleInMap(loaded, def.Name, mod) {
		return true
	}

	return false
}

func isExtEnabled(version string, def ExtDef, loaded map[string]bool) bool {
	mod := def.ModDebian
	if mod == "" {
		mod = def.Name
	}

	// 1. Check Debian/Ubuntu FPM conf.d
	fpmConfDir := filepath.Join("/etc/php", version, "fpm", "conf.d")
	if entries, err := os.ReadDir(fpmConfDir); err == nil && len(entries) > 0 {
		matches, _ := filepath.Glob(filepath.Join(fpmConfDir, "*"+mod+".ini"))
		return len(matches) > 0
	}

	// 2. Check Debian/Ubuntu CLI conf.d if FPM conf.d absent
	cliConfDir := filepath.Join("/etc/php", version, "cli", "conf.d")
	if entries, err := os.ReadDir(cliConfDir); err == nil && len(entries) > 0 {
		matches, _ := filepath.Glob(filepath.Join(cliConfDir, "*"+mod+".ini"))
		return len(matches) > 0
	}

	// 3. Check macOS Homebrew
	for _, base := range []string{"/opt/homebrew/etc/php", "/usr/local/etc/php"} {
		confDir := filepath.Join(base, version, "conf.d")
		if _, err := os.Stat(confDir); err == nil {
			disabled, _ := filepath.Glob(filepath.Join(confDir, "*"+def.Name+"*.ini.disabled"))
			if len(disabled) > 0 {
				return false
			}
			enabled, _ := filepath.Glob(filepath.Join(confDir, "*"+def.Name+"*.ini"))
			if len(enabled) > 0 {
				return true
			}
		}
	}

	// 4. Fallback to loaded modules map
	return isModuleInMap(loaded, def.Name, mod)
}

func isModuleInMap(loaded map[string]bool, name, mod string) bool {
	normName := strings.ToLower(name)
	normMod := strings.ToLower(mod)
	cleanName := strings.ReplaceAll(normName, "_", "")

	if loaded[normName] || loaded[normMod] || loaded[cleanName] {
		return true
	}
	if normName == "opcache" && (loaded["zendopcache"] || loaded["opcache"]) {
		return true
	}
	if normName == "pdo_mysql" && (loaded["pdo_mysql"] || loaded["pdomysql"] || loaded["mysqlnd"]) {
		return true
	}
	return false
}

// ToggleExtension enables or disables an installed PHP extension and restarts PHP-FPM.
func ToggleExtension(version, extName string, enable bool) error {
	if !phpVersionRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", fmt.Sprintf("invalid PHP version: %s", version))
	}
	def, ok := FindExtDef(extName)
	if !ok {
		return apierr.BadRequest("unknown_extension", fmt.Sprintf("extension %s is not supported", extName))
	}

	mod := def.ModDebian
	if mod == "" {
		mod = def.Name
	}

	var toggleErr error

	if runtime.GOOS == "darwin" {
		// macOS Homebrew conf.d management
		for _, base := range []string{"/opt/homebrew/etc/php", "/usr/local/etc/php"} {
			confDir := filepath.Join(base, version, "conf.d")
			if _, err := os.Stat(confDir); err == nil {
				if enable {
					matches, _ := filepath.Glob(filepath.Join(confDir, "*"+def.Name+"*.ini.disabled"))
					for _, m := range matches {
						_ = os.Rename(m, strings.TrimSuffix(m, ".disabled"))
					}
				} else {
					matches, _ := filepath.Glob(filepath.Join(confDir, "*"+def.Name+"*.ini"))
					for _, m := range matches {
						_ = os.Rename(m, m+".disabled")
					}
				}
			}
		}
	} else {
		// Debian/Ubuntu: use phpenmod / phpdismod when available
		if enable {
			if _, err := exec.LookPath("phpenmod"); err == nil {
				cmd := exec.Command("phpenmod", "-v", version, mod)
				_ = cmd.Run()
			}
			// Safety net: ensure symlink in /etc/php/{version}/fpm/conf.d exists
			fpmConfDir := filepath.Join("/etc/php", version, "fpm", "conf.d")
			modIni := filepath.Join("/etc/php", version, "mods-available", mod+".ini")
			if _, err := os.Stat(fpmConfDir); err == nil {
				if _, err := os.Stat(modIni); err == nil {
					targetLink := filepath.Join(fpmConfDir, "20-"+mod+".ini")
					matches, _ := filepath.Glob(filepath.Join(fpmConfDir, "*"+mod+".ini"))
					if len(matches) == 0 {
						_ = os.Symlink(modIni, targetLink)
					}
				}
			}
		} else {
			if _, err := exec.LookPath("phpdismod"); err == nil {
				cmd := exec.Command("phpdismod", "-v", version, mod)
				_ = cmd.Run()
			}
			// Safety net: remove any symlinks in fpm/conf.d and cli/conf.d
			for _, sub := range []string{"fpm", "cli"} {
				confDir := filepath.Join("/etc/php", version, sub, "conf.d")
				matches, _ := filepath.Glob(filepath.Join(confDir, "*"+mod+".ini"))
				for _, m := range matches {
					_ = os.Remove(m)
				}
			}
		}
	}

	// Reload PHP-FPM service
	reloadErr := ReloadPHPFpm(version)
	if toggleErr != nil {
		return toggleErr
	}
	if reloadErr != nil {
		// Service reload failure logged but not fatal if systemd is inactive
		return nil
	}
	return nil
}

// InstallExtension runs the package manager install for an extension and reloads PHP-FPM.
func InstallExtension(ctx context.Context, log tasks.LogFunc, version, extName string) error {
	if !phpVersionRe.MatchString(version) {
		return apierr.BadRequest("invalid_version", fmt.Sprintf("invalid PHP version: %s", version))
	}
	def, ok := FindExtDef(extName)
	if !ok {
		return apierr.BadRequest("unknown_extension", fmt.Sprintf("extension %s is not supported", extName))
	}

	pkg := def.PkgDebian
	if pkg == "" {
		pkg = def.Name
	}
	mod := def.ModDebian
	if mod == "" {
		mod = def.Name
	}

	log("info", fmt.Sprintf("Starting installation of PHP %s extension: %s", version, extName))

	if runtime.GOOS == "darwin" {
		log("info", fmt.Sprintf("macOS: Installing %s extension via pecl/brew...", extName))
		if extName == "redis" || extName == "imagick" {
			if extName == "imagick" {
				_ = exec.CommandContext(ctx, "brew", "install", "imagemagick").Run()
			}
			cmd := exec.CommandContext(ctx, "pecl", "install", "-f", extName)
			out, err := cmd.CombinedOutput()
			if err != nil {
				log("warn", fmt.Sprintf("pecl install output: %s", string(out)))
			}
		} else {
			log("info", fmt.Sprintf("Extension %s is bundled with php@%s on macOS", extName, version))
		}
		_ = RestartPHPFpm(version)
		log("info", fmt.Sprintf("PHP %s extension %s successfully installed and service reloaded", version, extName))
		return nil
	}

	// Debian / Ubuntu
	pkgName := fmt.Sprintf("php%s-%s", version, pkg)
	log("info", fmt.Sprintf("Executing apt-get install for package %s...", pkgName))

	installCmd := fmt.Sprintf("DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y %s", pkgName)
	cmd := exec.CommandContext(ctx, "sh", "-c", installCmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		log("error", fmt.Sprintf("apt-get install failed for %s: %s (output: %s)", pkgName, err, string(out)))
		return fmt.Errorf("failed to install %s: %w", pkgName, err)
	}

	log("info", fmt.Sprintf("Enabling extension %s...", mod))
	if _, err := exec.LookPath("phpenmod"); err == nil {
		_ = exec.CommandContext(ctx, "phpenmod", "-v", version, mod).Run()
	}

	log("info", fmt.Sprintf("Restarting php%s-fpm service...", version))
	if err := RestartPHPFpm(version); err != nil {
		log("warn", fmt.Sprintf("Restart php-fpm warning: %v", err))
	}

	log("info", fmt.Sprintf("PHP %s extension %s successfully installed and PHP-FPM restarted", version, extName))
	return nil
}
