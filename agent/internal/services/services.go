// Package services probes and controls the host's web-stack services
// (nginx, MySQL/MariaDB, PHP-FPM) for the monitoring endpoints.
//
// List is a read-only best-effort probe. Restart executes the
// operator-configured command (AGENT_*_RESTART_CMD) with an argument
// array - never a shell - serialized and recorded in the audit log.
package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Service names accepted by the API.
const (
	NameNginx  = "nginx"
	NameMySQL  = "mysql"
	NamePHPFpm = "php-fpm"
)

// States a service probe can report.
const (
	StateRunning = "running"
	StateStopped = "stopped"
	StateUnknown = "unknown"
)

const (
	// restartTimeout bounds one restart command invocation.
	restartTimeout = 60 * time.Second
	// stderrTailRunes is how much command stderr is echoed into API errors.
	stderrTailRunes = 300
	// pgrepNoMatch is pgrep's exit code for "no process matched".
	pgrepNoMatch = 1
	// actionRestart is the audit action recorded for service restarts.
	actionRestart = "service.restart"
)

// Status is one service's probed state.
type Status struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	State   string `json:"state"`
	PID     int    `json:"pid,omitempty"`
	Version string `json:"version,omitempty"`
	Details string `json:"details,omitempty"`
}

// Manager probes and restarts the host's services.
type Manager struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.Mutex
}

// New creates the manager.
func New(cfg config.Config, auditLog *audit.Log) *Manager {
	return &Manager{cfg: cfg, audit: auditLog}
}

// probeSpec tells the best-effort probe how to find one service's process,
// which restart command it uses and how to read its version.
type probeSpec struct {
	name         string
	label        string
	command      func(config.Config) string
	matchArgs    [][]string // pgrep arguments; the first matching variant wins
	versionCmds  [][]string // version commands tried in order
	parseVersion func(string) string
}

// specs describes the three services in the order List reports them.
var specs = []probeSpec{
	{
		name:         NameNginx,
		label:        "Nginx (web server)",
		command:      func(cfg config.Config) string { return cfg.NginxRestartCmd },
		matchArgs:    [][]string{{"-x", "nginx"}},
		versionCmds:  [][]string{{"nginx", "-v"}},
		parseVersion: nginxVersion,
	},
	{
		name:    NameMySQL,
		label:   "MySQL/MariaDB (database)",
		command: func(cfg config.Config) string { return cfg.MySQLRestartCmd },
		// MariaDB reports itself as mariadbd, MySQL as mysqld.
		matchArgs:    [][]string{{"-x", "mysqld"}, {"-x", "mariadbd"}},
		versionCmds:  [][]string{{"mysqld", "--version"}, {"mariadbd", "--version"}},
		parseVersion: mysqlVersion,
	},
	{
		name:    NamePHPFpm,
		label:   "PHP-FPM (application server)",
		command: func(cfg config.Config) string { return cfg.PHPFpmRestartCmd },
		// Installed php-fpm binaries are versioned (php-fpm8.3), so besides
		// the plain name the master process is matched by its command line.
		matchArgs:    [][]string{{"-x", "php-fpm"}, {"-f", "php-fpm: master"}},
		versionCmds:  [][]string{{"php-fpm", "-v"}},
		parseVersion: phpVersion,
	},
}

// specFor returns the probe for one of the known service names.
func specFor(name string) (probeSpec, bool) {
	for _, spec := range specs {
		if spec.name == name {
			return spec, true
		}
	}
	return probeSpec{}, false
}

// List probes every known service. Probing never fails the request: a
// service that cannot be probed reports state "unknown".
func (m *Manager) List(ctx context.Context) []Status {
	statuses := make([]Status, 0, len(specs))
	for _, spec := range specs {
		statuses = append(statuses, probe(ctx, spec))
	}
	return statuses
}

// Restart runs the configured restart command for name and returns the
// freshly probed status. Errors: 404 unknown_service, 409 dry_run,
// 412 restart_not_configured, 502 service_restart_failed.
func (m *Manager) Restart(ctx context.Context, name string) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	spec, ok := specFor(name)
	if !ok {
		return Status{}, apierr.NotFound("unknown_service", fmt.Sprintf("unknown service %q", name))
	}
	if m.cfg.DryRun {
		return Status{}, apierr.Conflict("dry_run", "service restarts are disabled in dry-run mode")
	}
	command := strings.TrimSpace(spec.command(m.cfg))
	if command == "" {
		return Status{}, apierr.New(412, "restart_not_configured",
			fmt.Sprintf("no restart command is configured for service %q", name))
	}

	if err := m.audit.Append(audit.Record{
		Action: actionRestart,
		Params: map[string]any{"name": name},
		Result: audit.ResultAccepted,
	}); err != nil {
		return Status{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := runRestart(ctx, name, command); err != nil {
		return Status{}, err
	}
	return probe(ctx, spec), nil
}

// runRestart executes command's argv with restartTimeout. A missing binary,
// a non-zero exit or a timeout maps to 502 service_restart_failed carrying
// the tail of the command's stderr.
func runRestart(ctx context.Context, name, command string) error {
	argv := strings.Fields(command)
	path, err := exec.LookPath(argv[0])
	if err != nil {
		return restartFailed(fmt.Sprintf("restart command binary %q is not installed", argv[0]))
	}

	ctx, cancel := context.WithTimeout(ctx, restartTimeout)
	defer cancel()

	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, path, argv[1:]...)
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	if runErr == nil {
		return nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return restartFailed(fmt.Sprintf("restart command timed out after %s", restartTimeout))
	}
	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("restart command failed: %v", runErr)
	}
	return restartFailed(fmt.Sprintf("restart of %s failed: %s", name, detail))
}

// restartFailed builds the documented 502 error.
func restartFailed(message string) error {
	return apierr.New(http.StatusBadGateway, "service_restart_failed", message)
}

// probe reports one service's status. It never fails: pgrep's "no match"
// exit code means the service is stopped, any other probe problem means
// "unknown" with a short note.
func probe(ctx context.Context, spec probeSpec) Status {
	status := Status{Name: spec.name, Label: spec.label, State: StateUnknown}
	for _, args := range spec.matchArgs {
		pid, err := pgrepPID(ctx, args)
		switch {
		case err == nil:
			status.State = StateRunning
			status.PID = pid
			status.Version = spec.version(ctx)
			return status
		case errors.Is(err, errNoMatch):
			continue
		case errors.Is(err, exec.ErrNotFound):
			status.Details = "pgrep is not installed"
			return status
		default:
			status.Details = fmt.Sprintf("probe failed: %v", err)
			return status
		}
	}
	status.State = StateStopped
	return status
}

// errNoMatch reports that pgrep found no process: the service is stopped,
// not unprobeable.
var errNoMatch = errors.New("no process matched")

// pgrepPID runs pgrep with args and returns the first matched PID.
func pgrepPID(ctx context.Context, args []string) (int, error) {
	out, err := exec.CommandContext(ctx, "pgrep", args...).Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == pgrepNoMatch {
			return 0, errNoMatch
		}
		return 0, err
	}
	pid, err := strconv.Atoi(firstLine(string(out)))
	if err != nil {
		return 0, fmt.Errorf("unexpected pgrep output %q", strings.TrimSpace(string(out)))
	}
	return pid, nil
}

// version returns the service's version or "" when it cannot be read. The
// output streams are combined because nginx prints its version to stderr.
func (s probeSpec) version(ctx context.Context) string {
	for _, argv := range s.versionCmds {
		out, err := exec.CommandContext(ctx, argv[0], argv[1:]...).CombinedOutput()
		if err != nil {
			continue
		}
		if v := s.parseVersion(string(out)); v != "" {
			return v
		}
	}
	return ""
}

// nginxVersion extracts "1.24.0" from "nginx version: nginx/1.24.0 (Ubuntu)".
func nginxVersion(out string) string {
	if i := strings.LastIndex(out, "nginx/"); i >= 0 {
		return firstToken(out[i+len("nginx/"):])
	}
	return ""
}

// mysqlVersion extracts the version token after "Ver" from the output of
// "mysqld --version" and "mariadbd --version".
func mysqlVersion(out string) string {
	fields := strings.Fields(out)
	for i, field := range fields {
		if field == "Ver" && i+1 < len(fields) {
			return fields[i+1]
		}
	}
	return ""
}

// phpVersion extracts "8.3.6" from "PHP 8.3.6 (fpm-fcgi) (built: ...)".
func phpVersion(out string) string {
	fields := strings.Fields(out)
	if len(fields) >= 2 && fields[0] == "PHP" {
		return fields[1]
	}
	return ""
}

// firstToken returns the leading whitespace-delimited token of s.
func firstToken(s string) string {
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// firstLine returns the first non-empty line of out, trimmed.
func firstLine(out string) string {
	for _, line := range strings.Split(out, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			return line
		}
	}
	return ""
}

// tailText collapses raw to a single line and keeps its last stderrTailRunes
// characters, which is where the command puts the actual failure.
func tailText(raw string) string {
	joined := strings.Join(strings.Fields(raw), " ")
	runes := []rune(joined)
	if len(runes) > stderrTailRunes {
		return "..." + string(runes[len(runes)-stderrTailRunes:])
	}
	return joined
}
