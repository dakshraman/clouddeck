// Package runtimes discovers the application runtimes installed on the host
// (Node.js, Python, Go, Ruby, PHP and friends) so the panel can offer real
// app hosting instead of static/PHP only.
package runtimes

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// Kind values returned in Runtime.Kind.
const (
	KindStatic = "static"
	KindPHP    = "php"
	KindNode   = "node"
	KindPython = "python"
	KindGo     = "go"
	KindRuby   = "ruby"
	KindCustom = "custom"
)

// Runtime is one discovered runtime installation.
type Runtime struct {
	Kind    string   `json:"kind"`
	Label   string   `json:"label"`
	Version string   `json:"version"`
	Bin     string   `json:"bin,omitempty"`
	Paths   []string `json:"paths,omitempty"`
	Default bool     `json:"default,omitempty"`
}

// KindInfo describes one runtime family offered by the panel.
type KindInfo struct {
	Kind        string    `json:"kind"`
	Label       string    `json:"label"`
	Description string    `json:"description"`
	DefaultPort int       `json:"defaultPort,omitempty"`
	Versions    []Runtime `json:"versions"`
	Available   bool      `json:"available"`
}

var versionRe = regexp.MustCompile(`(\d+\.\d+(?:\.\d+)?)`)

// Detect returns every runtime family this host can run, with the versions
// that were actually found. A family with no installation is still returned
// with Available=false so the UI can explain what is missing.
func Detect() []KindInfo {
	out := []KindInfo{
		{
			Kind:        KindStatic,
			Label:       "Static site",
			Description: "Plain HTML, CSS, JavaScript and assets served straight from the webroot.",
			Available:   true,
		},
		{
			Kind:        KindPHP,
			Label:       "PHP",
			Description: "PHP-FPM application served through the site's PHP pool.",
			Available:   len(phpVersions()) > 0,
		},
		{
			Kind:        KindNode,
			Label:       "Node.js",
			Description: "Node.js app or SSR framework proxied through nginx (WebSocket ready).",
			DefaultPort: 3000,
			Versions:    detectNode(),
		},
		{
			Kind:        KindPython,
			Label:       "Python",
			Description: "WSGI/ASGI app (Django, Flask, FastAPI) or a script run under a process manager.",
			DefaultPort: 8000,
			Versions:    detectPython(),
		},
		{
			Kind:        KindGo,
			Label:       "Go",
			Description: "Compiled Go binary or `go run` service proxied through nginx.",
			DefaultPort: 8080,
			Versions:    detectGo(),
		},
		{
			Kind:        KindRuby,
			Label:       "Ruby",
			Description: "Ruby / Rack application proxied through nginx.",
			DefaultPort: 9292,
			Versions:    detectRuby(),
		},
		{
			Kind:        KindCustom,
			Label:       "Custom command",
			Description: "Any long-running command you can start on a local port.",
			DefaultPort: 8080,
			Versions:    []Runtime{},
			Available:   true,
		},
	}
	for i := range out {
		if out[i].Versions == nil {
			out[i].Versions = []Runtime{}
		}
		if len(out[i].Versions) > 0 {
			out[i].Available = true
		}
	}
	return out
}

// Lookup returns the kind info for one runtime kind.
func Lookup(kind string) (KindInfo, bool) {
	for _, info := range Detect() {
		if info.Kind == kind {
			return info, true
		}
	}
	return KindInfo{}, false
}

// ValidKind reports whether kind is a runtime the agent understands.
func ValidKind(kind string) bool {
	switch kind {
	case KindStatic, KindPHP, KindNode, KindPython, KindGo, KindRuby, KindCustom:
		return true
	}
	return false
}

// IsApp reports whether the kind runs as a supervised process behind a proxy
// (as opposed to static files or PHP-FPM).
func IsApp(kind string) bool {
	switch kind {
	case KindNode, KindPython, KindGo, KindRuby, KindCustom:
		return true
	}
	return false
}

// DefaultPort returns the conventional local port for a runtime kind.
func DefaultPort(kind string) int {
	info, ok := Lookup(kind)
	if !ok {
		return 8080
	}
	if info.DefaultPort == 0 {
		return 8080
	}
	return info.DefaultPort
}

func detectNode() []Runtime {
	var found []Runtime
	if bin, version := probe("node", "-v"); version != "" {
		found = append(found, Runtime{Kind: KindNode, Label: "Node.js", Version: version, Bin: bin, Default: true})
	}
	for _, dir := range []string{"/www/server/nodejs", "/usr/local/nodejs", "/usr/local/n/versions/node", "/opt/nodejs"} {
		for _, v := range versionedDirs(dir, func(name string) bool { return versionRe.MatchString(name) }) {
			bin := filepath.Join(dir, v, "bin", "node")
			if !isExecutable(bin) {
				continue
			}
			found = append(found, Runtime{
				Kind:    KindNode,
				Label:   "Node.js",
				Version: strings.TrimPrefix(v, "v"),
				Bin:     bin,
				Paths:   []string{filepath.Dir(bin)},
			})
		}
	}
	return dedupe(found)
}

func detectPython() []Runtime {
	var found []Runtime
	if bin, version := probe("python3", "--version"); version != "" {
		found = append(found, Runtime{Kind: KindPython, Label: "Python", Version: version, Bin: bin, Default: true})
	}
	for _, dir := range []string{"/www/server/pyporject_evn", "/www/server/pyenv/versions", "/opt/python"} {
		for _, v := range versionedDirs(dir, func(name string) bool { return true }) {
			bin := filepath.Join(dir, v, "bin", "python3")
			if !isExecutable(bin) {
				continue
			}
			found = append(found, Runtime{
				Kind:    KindPython,
				Label:   "Python",
				Version: strings.TrimPrefix(v, "python"),
				Bin:     bin,
				Paths:   []string{filepath.Dir(bin)},
			})
		}
	}
	return dedupe(found)
}

func detectGo() []Runtime {
	if bin, version := probe("go", "version"); version != "" {
		return []Runtime{{Kind: KindGo, Label: "Go", Version: version, Bin: bin, Default: true}}
	}
	return []Runtime{}
}

func detectRuby() []Runtime {
	if bin, version := probe("ruby", "--version"); version != "" {
		return []Runtime{{Kind: KindRuby, Label: "Ruby", Version: version, Bin: bin, Default: true}}
	}
	return []Runtime{}
}

// probe runs `name args...` and extracts the first semantic version it prints.
func probe(name string, args ...string) (string, string) {
	if runtime.GOOS != "linux" {
		return "", ""
	}
	path, err := exec.LookPath(name)
	if err != nil {
		return "", ""
	}
	out, err := exec.Command(path, args...).CombinedOutput()
	if err != nil && len(out) == 0 {
		return path, ""
	}
	match := versionRe.FindString(string(out))
	return path, match
}

func versionedDirs(root string, accept func(string) bool) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []string
	for _, entry := range entries {
		if !entry.IsDir() || !accept(entry.Name()) {
			continue
		}
		out = append(out, entry.Name())
	}
	sort.Slice(out, func(i, j int) bool { return lessVersion(out[i], out[j]) })
	return out
}

// lessVersion orders 3.9 before 3.12 and v8 before v22.
func lessVersion(a, b string) bool {
	an := versionNumbers(a)
	bn := versionNumbers(b)
	for i := 0; i < len(an) && i < len(bn); i++ {
		if an[i] != bn[i] {
			return an[i] < bn[i]
		}
	}
	return len(an) < len(bn)
}

func versionNumbers(v string) []int {
	var out []int
	for _, part := range strings.FieldsFunc(v, func(r rune) bool { return r == '.' || r == '-' || r == 'v' }) {
		n, err := strconv.Atoi(part)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode()&0o111 != 0
}

// phpVersions lists the PHP-FPM versions present on the host.
func phpVersions() []string {
	var out []string
	entries, err := os.ReadDir("/etc/php")
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() && versionRe.MatchString(entry.Name()) {
				out = append(out, entry.Name())
			}
		}
	}
	entries, err = os.ReadDir("/www/server/php")
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() && versionRe.MatchString(entry.Name()) {
				out = append(out, entry.Name())
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return lessVersion(out[i], out[j]) })
	return out
}

func dedupe(in []Runtime) []Runtime {
	seen := map[string]bool{}
	out := make([]Runtime, 0, len(in))
	for _, rt := range in {
		key := rt.Kind + "@" + rt.Version + "@" + rt.Bin
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, rt)
	}
	sort.Slice(out, func(i, j int) bool { return lessVersion(out[i].Version, out[j].Version) })
	return out
}
