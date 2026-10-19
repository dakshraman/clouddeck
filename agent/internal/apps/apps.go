// Package apps manages application workloads hosted on a site: Node.js,
// Python, Go, Ruby or custom commands. Each app is a supervised process that
// listens on a local port and is proxied by the site's nginx vhost.
//
// The default supervisor is systemd, which every supported host already runs.
// PM2 and supervisord are supported as alternative backends through
// AGENT_APP_SUPERVISOR, so a server that already standardises on one of them
// keeps working.
package apps

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
)

// Task types owned by this package.
const (
	TaskStart = "app.start"
	TaskStop  = "app.stop"
)

// Supervisor backends.
const (
	SupervisorSystemd    = "systemd"
	SupervisorPM2        = "pm2"
	SupervisorSupervisor = "supervisor"
)

// App states reported to the panel.
const (
	StateRunning = "running"
	StateStopped = "stopped"
	StateError   = "error"
	StateUnknown = "unknown"
)

// Validation limits.
const (
	maxCommand  = 2048
	maxEnvValue = 4096
	maxNameLen  = 32
)

var (
	nameRe   = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`)
	envKeyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

// UnitPrefix is the systemd unit name prefix used for managed apps.
const UnitPrefix = "clouddeck-app-"

// NewID returns a short random-ish identifier for a new app.
func NewID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

// ValidateName checks an app name (a DNS label, used in unit names and paths).
func ValidateName(raw string) (string, error) {
	name := strings.ToLower(strings.TrimSpace(raw))
	if !nameRe.MatchString(name) {
		return "", apierr.BadRequest("invalid_app_name",
			fmt.Sprintf("invalid app name %q: use lowercase letters, digits and hyphens", raw))
	}
	return name, nil
}

// ValidateCommand checks the start command. The command runs as the site user
// through the supervisor, never through a shell string built by the panel.
func ValidateCommand(raw string) (string, error) {
	cmd := strings.TrimSpace(raw)
	if cmd == "" {
		return "", apierr.BadRequest("invalid_command", "start command is required")
	}
	if len(cmd) > maxCommand {
		return "", apierr.BadRequest("invalid_command", fmt.Sprintf("start command is longer than %d characters", maxCommand))
	}
	if strings.ContainsAny(cmd, "\x00\n\r") {
		return "", apierr.BadRequest("invalid_command", "start command must be a single line")
	}
	return cmd, nil
}

// ValidatePort checks a local listen port.
func ValidatePort(port int) (int, error) {
	if port < 1 || port > 65535 {
		return 0, apierr.BadRequest("invalid_port", fmt.Sprintf("port %d is outside 1-65535", port))
	}
	return port, nil
}

// ValidateEnv checks environment keys/values and returns a normalized copy.
func ValidateEnv(in map[string]string) (map[string]string, error) {
	out := make(map[string]string, len(in))
	for key, value := range in {
		if !envKeyRe.MatchString(key) {
			return nil, apierr.BadRequest("invalid_env", fmt.Sprintf("invalid environment variable name %q", key))
		}
		if len(value) > maxEnvValue {
			return nil, apierr.BadRequest("invalid_env", fmt.Sprintf("environment variable %q is too long", key))
		}
		if strings.ContainsAny(value, "\x00\n\r") {
			return nil, apierr.BadRequest("invalid_env", fmt.Sprintf("environment variable %q must be a single line", key))
		}
		out[key] = value
	}
	return out, nil
}

// ValidatePath checks that a working directory stays inside the site webroot.
func ValidatePath(root, raw string) (string, error) {
	clean := filepath.Clean(strings.TrimSpace(raw))
	if clean == "" || clean == "." {
		return root, nil
	}
	if !filepath.IsAbs(clean) {
		clean = filepath.Join(root, clean)
	}
	clean = filepath.Clean(clean)
	rel, err := filepath.Rel(root, clean)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", apierr.BadRequest("invalid_path", "working directory must be inside the site webroot")
	}
	return clean, nil
}

// Spec is the immutable definition of one app.
type Spec struct {
	ID          string            `json:"id"`
	Site        string            `json:"site"`
	Name        string            `json:"name"`
	Kind        string            `json:"kind"`
	Version     string            `json:"version,omitempty"`
	Bin         string            `json:"bin,omitempty"`
	Command     string            `json:"command"`
	Dir         string            `json:"dir"`
	Port        int               `json:"port"`
	Env         map[string]string `json:"env,omitempty"`
	HealthPath  string            `json:"healthPath,omitempty"`
	RunAs       string            `json:"runAs,omitempty"`
	Supervisor  string            `json:"supervisor"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
	AutoRestart bool              `json:"autoRestart"`
}

// Status is the live state of an app.
type Status struct {
	State     string     `json:"state"`
	PID       int        `json:"pid,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	UptimeSec int64      `json:"uptimeSeconds,omitempty"`
	Detail    string     `json:"detail,omitempty"`
}

// App is a Spec plus its live status.
type App struct {
	Spec
	Status Status `json:"status"`
}

// Proxy describes the nginx upstream for one app.
type Proxy struct {
	Name string
	Port int
}

// unitName returns the systemd unit (or PM2/supervisor program) name for an app.
func unitName(app Spec) string {
	return UnitPrefix + app.Site + "-" + app.Name
}

// supervisorName normalizes the configured supervisor backend.
func supervisorName(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case SupervisorPM2:
		return SupervisorPM2
	case SupervisorSupervisor, "supervisord":
		return SupervisorSupervisor
	default:
		return SupervisorSystemd
	}
}

// storeSpecs converts stored apps into specs for nginx rendering.
func (s *Service) proxyFor(site string) []Proxy {
	var out []Proxy
	for _, app := range s.st.ListApps() {
		if app.Site != site {
			continue
		}
		out = append(out, Proxy{Name: app.Name, Port: app.Port})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// ErrNotFound is returned when an app is missing from state.
var ErrNotFound = errors.New("app not found")

// ensureDir makes sure a directory exists.
func ensureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	return nil
}

// logDir returns the per-app log directory under the agent state dir.
func logDir(stateDir, site, name string) string {
	return filepath.Join(stateDir, "logs", "apps", site, name)
}
