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
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	// actionStop is the audit action recorded for service stops.
	actionStop = "service.stop"
	// actionStart is the audit action recorded for service starts.
	actionStart = "service.start"
	// actionRepair is the audit action recorded for service repairs.
	actionRepair = "service.repair"
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
// which restart/stop/start command it uses and how to read its version.
type probeSpec struct {
	name         string
	label        string
	command      func(config.Config) string
	stopCmd      func(config.Config) string
	startCmd     func(config.Config) string
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
		stopCmd:      func(cfg config.Config) string { return cfg.NginxStopCmd },
		startCmd:     func(cfg config.Config) string { return cfg.NginxStartCmd },
		matchArgs:    [][]string{{"-x", "nginx"}},
		versionCmds:  [][]string{{"nginx", "-v"}},
		parseVersion: nginxVersion,
	},
	{
		name:         NameMySQL,
		label:        "MySQL/MariaDB (database)",
		command:      func(cfg config.Config) string { return cfg.MySQLRestartCmd },
		stopCmd:      func(cfg config.Config) string { return cfg.MySQLStopCmd },
		startCmd:     func(cfg config.Config) string { return cfg.MySQLStartCmd },
		matchArgs:    [][]string{{"-x", "mysqld"}, {"-x", "mariadbd"}},
		versionCmds:  [][]string{{"mysqld", "--version"}, {"mariadbd", "--version"}},
		parseVersion: mysqlVersion,
	},
	{
		name:         NamePHPFpm,
		label:        "PHP-FPM (application server)",
		command:      func(cfg config.Config) string { return cfg.PHPFpmRestartCmd },
		stopCmd:      func(cfg config.Config) string { return cfg.PHPFpmStopCmd },
		startCmd:     func(cfg config.Config) string { return cfg.PHPFpmStartCmd },
		matchArgs:    [][]string{{"-x", "php-fpm"}, {"-f", "php-fpm: master"}, {"-f", "php-fpm"}},
		versionCmds:  [][]string{{"php-fpm", "-v"}, {"php", "-v"}, {"php-fpm8.4", "-v"}, {"php-fpm8.3", "-v"}, {"php-fpm8.2", "-v"}, {"php-fpm8.1", "-v"}},
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

// Restart runs the restart command for name and returns the freshly probed
// status. Commands come from AGENT_*_RESTART_CMD; unconfigured services
// default to `systemctl restart <unit>`. Errors: 404 unknown_service,
// 409 dry_run, 502 service_restart_failed.
func (m *Manager) Restart(ctx context.Context, name string) (Status, error) {
	return m.executeOp(ctx, "restart", actionRestart, name, func(s probeSpec) string { return s.command(m.cfg) }, defaultRestartCommand)
}

// Stop runs the stop command for name and returns the freshly probed status.
// Errors: 404 unknown_service, 409 dry_run, 502 service_stop_failed.
func (m *Manager) Stop(ctx context.Context, name string) (Status, error) {
	return m.executeOp(ctx, "stop", actionStop, name, func(s probeSpec) string { return s.stopCmd(m.cfg) }, defaultStopCommand)
}

// Start runs the start command for name and returns the freshly probed status.
// Errors: 404 unknown_service, 409 dry_run, 502 service_start_failed.
func (m *Manager) Start(ctx context.Context, name string) (Status, error) {
	return m.executeOp(ctx, "start", actionStart, name, func(s probeSpec) string { return s.startCmd(m.cfg) }, defaultStartCommand)
}

// Repair runs full self-healing recovery on the service:
// unmasks masked units, cleans up /etc/systemd/system/ dead masks,
// executes daemon-reload, and brings up the service.
func (m *Manager) Repair(ctx context.Context, name string) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	spec, ok := specFor(name)
	if !ok {
		return Status{}, apierr.NotFound("unknown_service", fmt.Sprintf("unknown service %q", name))
	}
	if m.cfg.DryRun {
		return Status{}, apierr.Conflict("dry_run", "service repairs are disabled in dry-run mode")
	}

	if err := m.audit.Append(audit.Record{
		Action: actionRepair,
		Params: map[string]any{"name": name},
		Result: audit.ResultAccepted,
	}); err != nil {
		return Status{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	// Force unmask and daemon-reload across all associated units
	unmaskAndReload(ctx, getAssociatedUnits(name)...)

	// Attempt starting or restarting through candidate commands
	candidates := opCommandCandidates("start", name)
	var lastErr error
	for _, cmdStr := range candidates {
		if err := runServiceOp(ctx, "start", name, cmdStr); err == nil {
			return probe(ctx, spec), nil
		} else {
			lastErr = err
		}
	}

	if lastErr != nil {
		return Status{}, lastErr
	}
	return probe(ctx, spec), nil
}

func (m *Manager) executeOp(
	ctx context.Context,
	op string,
	auditAction string,
	name string,
	cfgCmd func(probeSpec) string,
	defaultCmd func(string) string,
) (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	spec, ok := specFor(name)
	if !ok {
		return Status{}, apierr.NotFound("unknown_service", fmt.Sprintf("unknown service %q", name))
	}
	if m.cfg.DryRun {
		return Status{}, apierr.Conflict("dry_run", fmt.Sprintf("service %ss are disabled in dry-run mode", op))
	}

	command := strings.TrimSpace(cfgCmd(spec))
	usedDefault := command == ""
	if usedDefault {
		command = defaultCmd(name)
	}

	if err := m.audit.Append(audit.Record{
		Action: auditAction,
		Params: map[string]any{"name": name},
		Result: audit.ResultAccepted,
	}); err != nil {
		return Status{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	initialErr := runServiceOp(ctx, op, name, command)
	if initialErr == nil {
		return probe(ctx, spec), nil
	}

	if !usedDefault {
		return Status{}, initialErr
	}

	// Automatic self-healing: analyze failure and attempt recovery
	errStr := initialErr.Error()
	needsUnmask := strings.Contains(errStr, "masked") ||
		strings.Contains(errStr, "failed to load properly") ||
		strings.Contains(errStr, "File exists") ||
		strings.Contains(errStr, "reload service manager")

	if needsUnmask {
		unmaskAndReload(ctx, getAssociatedUnits(name)...)
		// Retry initial command after unmask & daemon-reload
		if retryErr := runServiceOp(ctx, op, name, command); retryErr == nil {
			return probe(ctx, spec), nil
		}
	}

	// Try all alternate commands (e.g. mariadb <-> mysql <-> mysqld, or service SysV fallback)
	candidates := opCommandCandidates(op, name)
	for _, altCmd := range candidates {
		if altCmd == command {
			continue
		}
		if err := runServiceOp(ctx, op, name, altCmd); err == nil {
			return probe(ctx, spec), nil
		}
	}

	// If unmasking was needed and all retries failed, return an actionable diagnosis
	if needsUnmask {
		if name == NameNginx {
			return Status{}, serviceOpFailed(op, fmt.Sprintf("%s of nginx failed: Unit nginx.service is masked or failed to load. Auto-unmask was attempted. Run 'sudo systemctl unmask nginx && sudo systemctl daemon-reload && sudo systemctl start nginx' on the host to recover.", op))
		}
		if name == NameMySQL {
			return Status{}, serviceOpFailed(op, fmt.Sprintf("%s of mysql failed: Unit failed to load properly. Auto-fix was attempted. Run 'sudo systemctl daemon-reload && sudo systemctl reset-failed mysql mariadb && sudo systemctl start mariadb || sudo systemctl start mysql' on the host to recover.", op))
		}
	}

	// If Nginx failed, append nginx -t diagnostic hints if syntax error is detected
	if name == NameNginx && runtime.GOOS != "windows" {
		if syntaxErr := checkNginxConfigSyntax(ctx); syntaxErr != "" {
			return Status{}, serviceOpFailed(op, fmt.Sprintf("%s of %s failed: %v (configuration test error: %s)", op, name, initialErr, syntaxErr))
		}
	}

	return Status{}, initialErr
}

// unmaskAndReload attempts to unmask unit files, remove /etc/systemd/system dead masks,
// and execute systemctl daemon-reload.
func unmaskAndReload(ctx context.Context, unitNames ...string) {
	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		return
	}
	systemctl, err := exec.LookPath("systemctl")
	if err != nil {
		return
	}

	sudo, _ := exec.LookPath("sudo")

	runSys := func(args ...string) {
		cmd := exec.CommandContext(ctx, systemctl, args...)
		if err := cmd.Run(); err != nil && sudo != "" {
			sudoArgs := append([]string{"-n", systemctl}, args...)
			_ = exec.CommandContext(ctx, sudo, sudoArgs...).Run()
		}
	}

	for _, unit := range unitNames {
		if unit == "" {
			continue
		}
		baseUnit := strings.TrimSuffix(unit, ".service")

		// Run systemctl reset-failed and unmask
		runSys("reset-failed", baseUnit)
		runSys("reset-failed", baseUnit+".service")
		runSys("unmask", baseUnit)
		runSys("unmask", baseUnit+".service")

		// Remove mask symlinks to /dev/null or broken dangling symlinks across systemd dirs
		for _, dir := range []string{
			"/etc/systemd/system",
			"/etc/systemd/system/multi-user.target.wants",
			"/run/systemd/system",
			"/usr/lib/systemd/system",
		} {
			for _, filename := range []string{baseUnit + ".service", baseUnit} {
				p := filepath.Join(dir, filename)
				if fi, lstatErr := os.Lstat(p); lstatErr == nil {
					if fi.Mode()&os.ModeSymlink != 0 {
						target, rErr := os.Readlink(p)
						if rErr == nil && (target == "/dev/null" || strings.Contains(target, "null")) {
							if remErr := os.Remove(p); remErr != nil && sudo != "" {
								_ = exec.CommandContext(ctx, sudo, "-n", "rm", "-f", p).Run()
							}
						} else if _, statErr := os.Stat(p); os.IsNotExist(statErr) {
							// Dangling or broken symlink
							if remErr := os.Remove(p); remErr != nil && sudo != "" {
								_ = exec.CommandContext(ctx, sudo, "-n", "rm", "-f", p).Run()
							}
						}
					}
				}
			}
		}
	}

	// Reload systemd daemon
	runSys("daemon-reload")
}

func getAssociatedUnits(name string) []string {
	switch name {
	case NameNginx:
		return []string{"nginx"}
	case NameMySQL:
		return []string{"mariadb", "mysql", "mysqld"}
	case NamePHPFpm:
		units := []string{"php-fpm"}
		units = append(units, phpFpmUnits()...)
		return units
	default:
		return []string{name}
	}
}

func opCommandCandidates(op, name string) []string {
	if runtime.GOOS == "darwin" {
		switch name {
		case NameNginx:
			return []string{"brew services " + op + " nginx"}
		case NameMySQL:
			return []string{"brew services " + op + " mariadb", "brew services " + op + " mysql"}
		case NamePHPFpm:
			return []string{"brew services " + op + " php"}
		}
		return nil
	}

	switch name {
	case NameNginx:
		return []string{
			"systemctl " + op + " nginx",
			"service nginx " + op,
			"/etc/init.d/nginx " + op,
		}
	case NameMySQL:
		return []string{
			"systemctl " + op + " mariadb",
			"systemctl " + op + " mysql",
			"systemctl " + op + " mysqld",
			"service mariadb " + op,
			"service mysql " + op,
			"/etc/init.d/mariadb " + op,
			"/etc/init.d/mysql " + op,
		}
	case NamePHPFpm:
		var list []string
		if units := phpFpmUnits(); len(units) > 0 {
			list = append(list, "systemctl "+op+" "+strings.Join(units, " "))
			for _, u := range units {
				list = append(list, "systemctl "+op+" "+u)
			}
		}
		list = append(list,
			"systemctl "+op+" php-fpm",
			"service php-fpm "+op,
			"service php8.4-fpm "+op,
			"service php8.3-fpm "+op,
			"service php8.2-fpm "+op,
			"service php8.1-fpm "+op,
		)
		return list
	}
	return nil
}

func checkNginxConfigSyntax(ctx context.Context) string {
	nginxBin, err := exec.LookPath("nginx")
	if err != nil {
		return ""
	}
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, nginxBin, "-t")
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
		if len(lines) > 2 {
			return strings.Join(lines[len(lines)-2:], " ")
		}
		return strings.TrimSpace(stderr.String())
	}
	return ""
}

func phpFpmUnits() []string {
	out, err := exec.Command("systemctl", "list-unit-files", "--type=service",
		"--no-legend", "php*-fpm*.service").Output()
	if err != nil {
		return nil
	}
	var units []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if fields := strings.Fields(line); len(fields) > 0 {
			units = append(units, strings.TrimSuffix(fields[0], ".service"))
		}
	}
	return units
}

// defaultStopCommand is used when the operator did not configure AGENT_*_STOP_CMD.
func defaultStopCommand(name string) string {
	if runtime.GOOS == "darwin" {
		switch name {
		case NameNginx:
			return "brew services stop nginx"
		case NameMySQL:
			return "brew services stop mariadb"
		case NamePHPFpm:
			return "brew services stop php"
		}
	}
	switch name {
	case NameNginx:
		return "systemctl stop nginx"
	case NameMySQL:
		return "systemctl stop mysql"
	case NamePHPFpm:
		if units := phpFpmUnits(); len(units) > 0 {
			return "systemctl stop " + strings.Join(units, " ")
		}
		return "systemctl stop php-fpm"
	}
	return ""
}

// defaultStartCommand is used when the operator did not configure AGENT_*_START_CMD.
func defaultStartCommand(name string) string {
	if runtime.GOOS == "darwin" {
		switch name {
		case NameNginx:
			return "brew services start nginx"
		case NameMySQL:
			return "brew services start mariadb"
		case NamePHPFpm:
			return "brew services start php"
		}
	}
	switch name {
	case NameNginx:
		return "systemctl start nginx"
	case NameMySQL:
		return "systemctl start mysql"
	case NamePHPFpm:
		if units := phpFpmUnits(); len(units) > 0 {
			return "systemctl start " + strings.Join(units, " ")
		}
		return "systemctl start php-fpm"
	}
	return ""
}

// defaultRestartCommand is used when the operator did not configure
// AGENT_*_RESTART_CMD: restart through the service's systemd unit. For
// PHP-FPM the distro unit is versioned (php8.3-fpm), so discover it from
// systemd before falling back to the plain name.
func defaultRestartCommand(name string) string {
	if runtime.GOOS == "darwin" {
		switch name {
		case NameNginx:
			return "brew services restart nginx"
		case NameMySQL:
			return "brew services restart mariadb"
		case NamePHPFpm:
			return "brew services restart php"
		}
	}
	switch name {
	case NameNginx:
		return "systemctl restart nginx"
	case NameMySQL:
		return "systemctl restart mysql"
	case NamePHPFpm:
		if units := phpFpmUnits(); len(units) > 0 {
			return "systemctl restart " + strings.Join(units, " ")
		}
		return "systemctl restart php-fpm"
	}
	return ""
}

func runRestart(ctx context.Context, name, command string) error {
	return runServiceOp(ctx, "restart", name, command)
}

// runServiceOp executes command's argv with restartTimeout. A missing binary,
// a non-zero exit or a timeout maps to 502 service_{op}_failed carrying
// the tail of the command's stderr.
func runServiceOp(ctx context.Context, op, name, command string) error {
	argv := strings.Fields(command)
	if len(argv) == 0 {
		return serviceOpFailed(op, fmt.Sprintf("%s command is empty", op))
	}
	path, err := exec.LookPath(argv[0])
	if err != nil && argv[0] == "brew" {
		for _, p := range []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew"} {
			if _, statErr := os.Stat(p); statErr == nil {
				path = p
				err = nil
				break
			}
		}
	}
	if err != nil {
		return serviceOpFailed(op, fmt.Sprintf("%s command binary %q is not installed", op, argv[0]))
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
	if runtime.GOOS != "windows" && os.Geteuid() != 0 {
		if sudo, sErr := exec.LookPath("sudo"); sErr == nil {
			sudoArgs := append([]string{"-n", path}, argv[1:]...)
			sudoCmd := exec.CommandContext(ctx, sudo, sudoArgs...)
			var sudoStderr bytes.Buffer
			sudoCmd.Stderr = &sudoStderr
			if sudoErr := sudoCmd.Run(); sudoErr == nil {
				return nil
			}
		}
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return serviceOpFailed(op, fmt.Sprintf("%s command timed out after %s", op, restartTimeout))
	}
	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("%s command failed: %v", op, runErr)
	}
	return serviceOpFailed(op, fmt.Sprintf("%s of %s failed: %s", op, name, detail))
}

func serviceOpFailed(op, message string) error {
	code := "service_" + op + "_failed"
	return apierr.New(http.StatusBadGateway, code, message)
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
		cmdPath := argv[0]
		if _, err := exec.LookPath(cmdPath); err != nil {
			for _, candidate := range []string{
				filepath.Join("/opt/homebrew/bin", cmdPath),
				filepath.Join("/opt/homebrew/sbin", cmdPath),
				filepath.Join("/usr/local/bin", cmdPath),
				filepath.Join("/usr/local/sbin", cmdPath),
				filepath.Join("/usr/bin", cmdPath),
				filepath.Join("/usr/sbin", cmdPath),
			} {
				if _, statErr := os.Stat(candidate); statErr == nil {
					cmdPath = candidate
					break
				}
			}
		}
		out, err := exec.CommandContext(ctx, cmdPath, argv[1:]...).CombinedOutput()
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
