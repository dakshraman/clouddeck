// Supervisor backends for managed apps: systemd (default), PM2 and supervisord.
package apps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/safeexec"
)

// unitPath is where systemd unit files for managed apps are written.
func (s *Service) unitPath(app Spec) string {
	return filepath.Join(s.cfg.AppUnitDir, unitName(app)+".service")
}

// writeSystemdUnit renders and writes the unit file for an app.
func (s *Service) writeSystemdUnit(app Spec) error {
	if err := os.MkdirAll(s.cfg.AppUnitDir, 0o755); err != nil {
		return fmt.Errorf("create unit dir: %w", err)
	}
	if err := ensureDir(app.Dir); err != nil {
		return err
	}
	if err := os.MkdirAll(logDir(s.cfg.StateDir, app.Site, app.Name), 0o755); err != nil {
		return fmt.Errorf("create app log dir: %w", err)
	}

	// The command runs through /bin/sh -c so operators can use normal shell
	// syntax (e.g. "npm start"), but the unit file is written by the agent and
	// never interpolated from an untrusted template.
	var envLines strings.Builder
	for _, key := range sortedKeys(app.Env) {
		envLines.WriteString("Environment=" + quoteUnit(key+"="+app.Env[key]) + "\n")
	}
	// $PORT is always exported so a start command can bind to the app port
	// without hard-coding it. An explicit PORT env var wins.
	if _, ok := app.Env["PORT"]; !ok {
		envLines.WriteString("Environment=" + quoteUnit("PORT="+strconv.Itoa(app.Port)) + "\n")
	}
	if app.Bin != "" {
		envLines.WriteString("Environment=" + quoteUnit("PATH="+filepath.Dir(app.Bin)+":/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin") + "\n")
	}

	unit := fmt.Sprintf(`# managed-by: clouddeck
[Unit]
Description=CloudDeck app %s on %s (%s)
After=network.target

[Service]
Type=simple
WorkingDirectory=%s
ExecStart=/bin/sh -lc %s
Restart=%s
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20
%s%s
StandardOutput=append:%s/app.log
StandardError=append:%s/app.log

[Install]
WantedBy=multi-user.target
`,
		app.Name, app.Site, app.Kind,
		app.Dir,
		quoteUnit(app.Command),
		restartPolicy(app.AutoRestart),
		runAsLine(app.RunAs),
		envLines.String(),
		logDir(s.cfg.StateDir, app.Site, app.Name),
		logDir(s.cfg.StateDir, app.Site, app.Name),
	)
	return os.WriteFile(s.unitPath(app), []byte(unit), 0o644)
}

func restartPolicy(auto bool) string {
	if auto {
		return "always"
	}
	return "no"
}

func runAsLine(runAs string) string {
	if strings.TrimSpace(runAs) == "" {
		return ""
	}
	return "User=" + strings.TrimSpace(runAs) + "\n"
}

// quoteUnit quotes a value for a systemd unit file.
func quoteUnit(value string) string {
	return strconv.Quote(value)
}

func sortedKeys(in map[string]string) []string {
	keys := make([]string, 0, len(in))
	for key := range in {
		keys = append(keys, key)
	}
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}

// ---- lifecycle operations, dispatched per backend ----

// Start launches an app under the configured supervisor.
func (s *Service) Start(ctx context.Context, log safeexec.Logger, app Spec) error {
	switch supervisorName(s.cfg.AppSupervisor) {
	case SupervisorPM2:
		return s.startPM2(ctx, log, app)
	case SupervisorSupervisor:
		return s.startSupervisor(ctx, log, app)
	default:
		if err := s.writeSystemdUnit(app); err != nil {
			return err
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "daemon-reload"); err != nil {
			return err
		}
		// Enable makes the app survive a reboot; restart applies the fresh unit.
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "enable", unitName(app)+".service"); err != nil {
			return err
		}
		return safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "restart", unitName(app)+".service")
	}
}

// Stop halts an app.
func (s *Service) Stop(ctx context.Context, log safeexec.Logger, app Spec) error {
	switch supervisorName(s.cfg.AppSupervisor) {
	case SupervisorPM2:
		return safeexec.Run(ctx, s.cfg.DryRun, log, "pm2", "stop", unitName(app))
	case SupervisorSupervisor:
		return safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "stop", unitName(app))
	default:
		return safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "stop", unitName(app)+".service")
	}
}

// Remove deletes an app's supervisor definition.
func (s *Service) Remove(ctx context.Context, log safeexec.Logger, app Spec) error {
	switch supervisorName(s.cfg.AppSupervisor) {
	case SupervisorPM2:
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "pm2", "delete", unitName(app))
	case SupervisorSupervisor:
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "stop", unitName(app))
		_ = os.Remove(filepath.Join(s.cfg.SupConfDir, unitName(app)+".conf"))
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "reread")
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "update")
	default:
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "stop", unitName(app)+".service")
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "disable", unitName(app)+".service")
		if err := os.Remove(s.unitPath(app)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove unit file: %w", err)
		}
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "daemon-reload")
	}
	return nil
}

func (s *Service) startPM2(ctx context.Context, log safeexec.Logger, app Spec) error {
	path, err := s.writePM2Ecosystem(app)
	if err != nil {
		return err
	}
	// Drop any previous definition first so a changed command or environment
	// takes effect instead of PM2 refusing to start a known name.
	_ = safeexec.Run(ctx, s.cfg.DryRun, log, "pm2", "delete", unitName(app))
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "pm2", "start", path); err != nil {
		return err
	}
	if s.cfg.DryRun {
		return nil
	}
	// PM2 returns as soon as the daemon accepted the process; give it a moment
	// to reach online/errored so the create/start response carries real state.
	deadline := time.Now().Add(5 * time.Second)
	for {
		state := s.pm2Status(ctx, app).State
		if state == StateRunning || state == StateError {
			return nil
		}
		if time.Now().After(deadline) {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// pm2EcosystemPath is the PM2 descriptor written for one app.
func (s *Service) pm2EcosystemPath(app Spec) string {
	return filepath.Join(s.cfg.StateDir, "apps", app.Site, app.Name, "ecosystem.json")
}

// writePM2Ecosystem renders the PM2 ecosystem file. PM2 cannot take per-app
// environment variables on the command line, so the descriptor carries the
// working directory, PORT and log paths instead of relying on the daemon's
// ambient state.
func (s *Service) writePM2Ecosystem(app Spec) (string, error) {
	if err := ensureDir(app.Dir); err != nil {
		return "", err
	}
	logs := logDir(s.cfg.StateDir, app.Site, app.Name)
	if err := os.MkdirAll(logs, 0o755); err != nil {
		return "", fmt.Errorf("create app log dir: %w", err)
	}
	env := make(map[string]string, len(app.Env)+1)
	for key, value := range app.Env {
		env[key] = value
	}
	if _, ok := env["PORT"]; !ok {
		env["PORT"] = strconv.Itoa(app.Port)
	}
	descriptor := map[string]any{
		"apps": []map[string]any{{
			"name":        unitName(app),
			"script":      "/bin/sh",
			"args":        []string{"-lc", app.Command},
			"cwd":         app.Dir,
			"autorestart": app.AutoRestart,
			"env":         env,
			"out_file":    filepath.Join(logs, "app.log"),
			"error_file":  filepath.Join(logs, "app.log"),
			"merge_logs":  true,
			"time":        true,
		}},
	}
	data, err := json.MarshalIndent(descriptor, "", "  ")
	if err != nil {
		return "", fmt.Errorf("render pm2 ecosystem: %w", err)
	}
	path := s.pm2EcosystemPath(app)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create pm2 dir: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("write pm2 ecosystem: %w", err)
	}
	return path, nil
}

func (s *Service) startSupervisor(ctx context.Context, log safeexec.Logger, app Spec) error {
	if err := os.MkdirAll(s.cfg.SupConfDir, 0o755); err != nil {
		return fmt.Errorf("create supervisor dir: %w", err)
	}
	logs := logDir(s.cfg.StateDir, app.Site, app.Name)
	if err := os.MkdirAll(logs, 0o755); err != nil {
		return fmt.Errorf("create app log dir: %w", err)
	}
	var pairs []string
	for _, key := range sortedKeys(app.Env) {
		pairs = append(pairs, fmt.Sprintf("%s=%q", key, app.Env[key]))
	}
	envLine := ""
	if len(pairs) > 0 {
		envLine = "environment=" + strings.Join(pairs, ",") + "\n"
	}
	conf := fmt.Sprintf(`; managed-by: clouddeck
[program:%s]
command=/bin/sh -lc %q
directory=%s
autostart=true
autorestart=%t
startsecs=3
stdout_logfile=%s/app.log
stderr_logfile=%s/app.log
%s`,
		unitName(app), app.Command, app.Dir,
		app.AutoRestart,
		logs, logs,
		envLine,
	)
	path := filepath.Join(s.cfg.SupConfDir, unitName(app)+".conf")
	if err := os.WriteFile(path, []byte(conf), 0o644); err != nil {
		return err
	}
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "reread"); err != nil {
		return err
	}
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "update"); err != nil {
		return err
	}
	return safeexec.Run(ctx, s.cfg.DryRun, log, "supervisorctl", "restart", unitName(app))
}

// liveStatus queries the supervisor for an app's state.
func (s *Service) liveStatus(ctx context.Context, app Spec) Status {
	switch supervisorName(s.cfg.AppSupervisor) {
	case SupervisorPM2:
		return s.pm2Status(ctx, app)
	case SupervisorSupervisor:
		return s.supervisorStatus(ctx, app)
	default:
		return s.systemdStatus(ctx, app)
	}
}

func (s *Service) systemdStatus(ctx context.Context, app Spec) Status {
	unit := unitName(app) + ".service"
	out, err := exec.CommandContext(ctx, "systemctl", "show", unit,
		"--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp").Output()
	if err != nil {
		return Status{State: StateUnknown, Detail: "systemctl is unavailable"}
	}
	props := map[string]string{}
	for _, line := range strings.Split(string(out), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			props[key] = value
		}
	}
	status := Status{State: StateStopped}
	switch props["ActiveState"] {
	case "active":
		status.State = StateRunning
	case "failed":
		status.State = StateError
	case "activating":
		status.State = StateStopped
	}
	if pid, err := strconv.Atoi(props["MainPID"]); err == nil && pid > 0 {
		status.PID = pid
	}
	if started := props["ExecMainStartTimestamp"]; started != "" && started != "n/a" {
		if ts, err := time.Parse("Mon 2006-01-02 15:04:05 MST", started); err == nil {
			status.StartedAt = &ts
			status.UptimeSec = int64(time.Since(ts).Seconds())
		}
	}
	status.Detail = strings.TrimSpace(props["SubState"])
	return status
}

func (s *Service) pm2Status(ctx context.Context, app Spec) Status {
	out, err := exec.CommandContext(ctx, "pm2", "jlist").Output()
	if err != nil {
		return Status{State: StateUnknown, Detail: "pm2 is unavailable"}
	}
	var list []struct {
		Name string `json:"name"`
		Pid  int    `json:"pid"`
		Env  struct {
			Status   string `json:"status"`
			PmUptime int64  `json:"pm_uptime"`
		} `json:"pm2_env"`
	}
	if err := json.Unmarshal(out, &list); err != nil {
		return Status{State: StateUnknown, Detail: "pm2 returned invalid JSON"}
	}
	name := unitName(app)
	for _, entry := range list {
		if entry.Name != name {
			continue
		}
		status := Status{State: StateStopped, PID: entry.Pid}
		switch entry.Env.Status {
		case "online":
			status.State = StateRunning
		case "errored":
			status.State = StateError
		}
		status.Detail = entry.Env.Status
		if entry.Env.PmUptime > 0 {
			started := time.UnixMilli(entry.Env.PmUptime)
			status.StartedAt = &started
			status.UptimeSec = int64(time.Since(started).Seconds())
		}
		return status
	}
	return Status{State: StateStopped}
}

func (s *Service) supervisorStatus(ctx context.Context, app Spec) Status {
	out, err := exec.CommandContext(ctx, "supervisorctl", "status", unitName(app)).Output()
	if err != nil {
		return Status{State: StateStopped}
	}
	line := strings.TrimSpace(string(out))
	status := Status{State: StateStopped, Detail: line}
	if strings.Contains(line, "RUNNING") {
		status.State = StateRunning
	} else if strings.Contains(line, "FATAL") || strings.Contains(line, "BACKOFF") {
		status.State = StateError
	}
	// "name   RUNNING   pid 123, uptime 0:01:02"
	if idx := strings.Index(line, "pid "); idx >= 0 {
		rest := line[idx+4:]
		if end := strings.IndexAny(rest, ","); end > 0 {
			if pid, err := strconv.Atoi(strings.TrimSpace(rest[:end])); err == nil {
				status.PID = pid
			}
		}
	}
	return status
}
