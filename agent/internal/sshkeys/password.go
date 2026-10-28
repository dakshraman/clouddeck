package sshkeys

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// Login-password changes for SSH users, driven by a chpasswd-style helper.
const (
	actionPasswordChange = "ssh.password.change"
	passwordMinLen       = 8
	passwordMaxLen       = 256
	stderrTailRunes      = 300
)

// userRegex is the username shape chpasswd accepts.
var userRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$`)

// SetPassword changes a unix account's login password via the configured
// chpasswd-style helper (AGENT_CHPASSWD_BIN, default chpasswd). The password
// travels to the helper's stdin only - never in argv or the audit log.
// Errors: 400 invalid_username / invalid_password, 409 dry_run,
// 502 password_change_failed.
func (s *Service) SetPassword(userName, password string) error {
	if s.cfg.DryRun {
		return apierr.Conflict("dry_run", "SSH password changes are disabled in dry-run mode")
	}
	userName = strings.TrimSpace(userName)
	if !userRegex.MatchString(userName) {
		return apierr.BadRequest("invalid_username",
			"username must be 1-32 characters: letters, numbers, underscore or dash")
	}
	if len(password) < passwordMinLen || len(password) > passwordMaxLen ||
		strings.ContainsFunc(password, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
		return apierr.BadRequest("invalid_password",
			fmt.Sprintf("password must be %d-%d characters without control characters", passwordMinLen, passwordMaxLen))
	}
	bin := s.cfg.ChpasswdBin
	if strings.TrimSpace(bin) == "" {
		bin = "chpasswd"
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return apierr.New(502, "password_change_failed", fmt.Sprintf("password helper %q is not installed", bin))
	}
	if err := s.accept(actionPasswordChange, map[string]any{"user": userName}); err != nil {
		return err
	}
	cmd := exec.Command(path)
	cmd.Stdin = strings.NewReader(userName + ":" + password + "\n")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		detail := strings.Join(strings.Fields(stderr.String()), " ")
		runes := []rune(detail)
		if len(runes) > stderrTailRunes {
			detail = "..." + string(runes[len(runes)-stderrTailRunes:])
		}
		if detail == "" {
			detail = fmt.Sprintf("%v", err)
		}
		return apierr.New(502, "password_change_failed",
			fmt.Sprintf("password change for %s failed: %s", userName, detail))
	}
	return nil
}
