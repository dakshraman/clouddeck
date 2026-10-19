// Package phpmyadmin detects a phpMyAdmin installation (aaPanel-style layout:
// a port.pl file plus one phpmyadmin_<hash> directory) so the panel can link
// to it. See docs/api.md section 1.9.
package phpmyadmin

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/config"
)

const (
	// webDirPrefix marks the phpMyAdmin web directories inside the install root.
	webDirPrefix = "phpmyadmin_"
	// probeTimeout bounds the localhost reachability probe.
	probeTimeout = 3 * time.Second
)

// authTypeRe extracts auth_type from config.inc.php, e.g.
// $cfg['Servers'][$i]['auth_type'] = 'cookie';
var authTypeRe = regexp.MustCompile(`auth_type'\s*\]\s*=\s*'([a-z]+)'`)

// Status is the /v1/phpmyadmin/status body.
type Status struct {
	Installed bool   `json:"installed"`
	Dir       string `json:"dir,omitempty"`
	Port      int    `json:"port,omitempty"`
	Version   string `json:"version,omitempty"`
	URLPath   string `json:"urlPath,omitempty"`
	Reachable bool   `json:"reachable"`
	AuthType  string `json:"authType,omitempty"`
}

// Service detects the local phpMyAdmin.
type Service struct {
	cfg config.Config
}

// New creates the detector.
func New(cfg config.Config) *Service {
	return &Service{cfg: cfg}
}

// Status inspects AGENT_PHPMYADMIN_DIR and probes the discovered URL. Detection
// failures are reported as an uninstalled, zero-valued Status; Status never
// errors.
func (s *Service) Status() Status {
	root := s.cfg.PHPMYADMINDir
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return Status{}
	}
	port, ok := readPort(filepath.Join(root, "port.pl"))
	if !ok {
		return Status{}
	}
	webDir, ok := findWebDir(root)
	if !ok {
		return Status{}
	}

	st := Status{
		Installed: true,
		Dir:       root,
		Port:      port,
		Version:   readTrimmed(filepath.Join(root, "version.pl")),
		URLPath:   "/" + filepath.Base(webDir) + "/",
		AuthType:  readAuthType(filepath.Join(webDir, "config.inc.php")),
	}
	st.Reachable = probe(st.Port, st.URLPath)
	return st
}

// readPort parses port.pl, which holds the listening port as an integer.
func readPort(path string) (int, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, false
	}
	port, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || port <= 0 {
		return 0, false
	}
	return port, true
}

// findWebDir returns the first phpmyadmin_* subdirectory, in lexical order,
// that contains an index.php.
func findWebDir(root string) (string, bool) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", false
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() && strings.HasPrefix(entry.Name(), webDirPrefix) {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		dir := filepath.Join(root, name)
		if isFile(filepath.Join(dir, "index.php")) {
			return dir, true
		}
	}
	return "", false
}

// isFile reports whether path exists and is not a directory.
func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// readTrimmed returns the trimmed file content, or "" when the file is
// missing (best-effort fields).
func readTrimmed(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

// readAuthType extracts auth_type from config.inc.php. The field is
// best-effort: a missing file or match yields "".
func readAuthType(path string) string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	m := authTypeRe.FindSubmatch(raw)
	if m == nil {
		return ""
	}
	return string(m[1])
}

// probe requests urlPath on 127.0.0.1:port and reports whether the server
// answers with a 2xx/3xx status. Redirects are not followed: the status of the
// probed URL itself is what matters.
func probe(port int, urlPath string) bool {
	client := &http.Client{
		Timeout: probeTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, urlPath))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}
