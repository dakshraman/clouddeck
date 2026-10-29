package server

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

const actionUpdate = "system.update"

var updateVersionRe = regexp.MustCompile(`^\d{1,2}\.\d{1,2}\.\d{1,2}$`)

// handleUpdate starts a self-update through the configured updater. It runs
// in a transient systemd unit (or its own session without systemd) because the
// installer restarts this agent, and a child in the agent's cgroup would be
// killed halfway through. An empty version updates to the latest release.
// Errors: 400 invalid_version, 409 dry_run, 412 update_not_configured,
// 502 update_failed.
func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Version string `json:"version"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	version, err := normalizeUpdateVersion(req.Version)
	if err != nil {
		writeError(w, err)
		return
	}
	if s.cfg.DryRun {
		writeError(w, apierr.Conflict("dry_run", "updates are disabled in dry-run mode"))
		return
	}
	argv := strings.Fields(s.cfg.UpdateCmd)
	if len(argv) == 0 {
		writeError(w, apierr.New(412, "update_not_configured", "no update command is configured"))
		return
	}
	if err := s.audit.Append(audit.Record{
		Action: actionUpdate,
		Params: map[string]any{"version": version, "command": strings.Join(argv, " ")},
		Result: audit.ResultAccepted,
	}); err != nil {
		writeError(w, apierr.Internal(fmt.Sprintf("write audit log: %v", err)))
		return
	}

	logPath := filepath.Join(s.cfg.StateDir, "update.log")
	script := strings.Join(argv, " ")
	if version != "" {
		script += " " + version
	}
	script += " >> " + shellQuote(logPath) + " 2>&1"

	launcher := "systemd-run"
	args := []string{"--unit=clouddeck-update", "--collect", "/bin/sh", "-c", script}
	if _, err := os.Stat("/run/systemd/system"); err != nil {
		// No systemd: a new session survives the installer's stop script.
		launcher, args = "setsid", []string{"/bin/sh", "-c", script}
	}
	if _, err := exec.LookPath(launcher); err != nil {
		writeError(w, apierr.New(502, "update_failed", fmt.Sprintf("%s is not installed", launcher)))
		return
	}
	cmd := exec.Command(launcher, args...)
	if err := cmd.Start(); err != nil {
		writeError(w, apierr.New(502, "update_failed", fmt.Sprintf("start updater: %v", err)))
		return
	}
	_ = cmd.Process.Release()

	writeJSON(w, http.StatusAccepted, map[string]any{
		"started": true,
		"version": version,
		"log":     logPath,
	})
}

// normalizeUpdateVersion accepts an empty version (latest) or X.Y.Z with an
// optional leading v.
func normalizeUpdateVersion(raw string) (string, error) {
	version := strings.TrimPrefix(strings.TrimSpace(raw), "v")
	if version != "" && !updateVersionRe.MatchString(version) {
		return "", apierr.BadRequest("invalid_version", "version must look like 0.6.9")
	}
	return version, nil
}

// shellQuote single-quotes a value for /bin/sh.
func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}
