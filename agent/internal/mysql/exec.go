package mysql

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
)

const (
	// queryTimeout bounds every client invocation.
	queryTimeout = 30 * time.Second
	// stderrTailRunes is how much client stderr is echoed into API errors.
	stderrTailRunes = 300
)

// run invokes the configured client binary with the given statement using an
// argument array (never a shell), passing the root password via MYSQL_PWD,
// and returns its stdout. Client failures map to the documented API errors:
// a missing binary or an unreachable server is a 503 mysql_unavailable,
// anything else a 500 mysql_error with a stderr tail.
func (s *Service) run(ctx context.Context, sql string) (string, error) {
	path, err := exec.LookPath(s.cfg.MySQLBin)
	if err != nil {
		return "", apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			fmt.Sprintf("mysql client %q is not installed on this server", s.cfg.MySQLBin))
	}

	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	args := []string{"--batch", "--skip-column-names", "-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, "-e", sql)

	cmd := exec.CommandContext(ctx, path, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	if runErr == nil {
		return stdout.String(), nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		if errors.Is(ctxErr, context.DeadlineExceeded) {
			return "", apierr.New(http.StatusInternalServerError, "mysql_error",
				fmt.Sprintf("mysql client timed out after %s", queryTimeout))
		}
		return "", apierr.New(http.StatusInternalServerError, "mysql_error", "mysql client invocation canceled")
	}

	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("mysql client failed: %v", runErr)
	}
	if isUnavailable(stderr.String()) {
		return "", apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			"mysql server is not reachable: "+detail)
	}
	return "", apierr.New(http.StatusInternalServerError, "mysql_error", detail)
}

// isUnavailable reports whether client stderr shows an unreachable server.
func isUnavailable(stderr string) bool {
	lower := strings.ToLower(stderr)
	return strings.Contains(lower, "can't connect") || strings.Contains(lower, "unknown socket")
}

// tailText collapses raw to a single line and keeps its last stderrTailRunes
// characters, which is where the client puts the actual failure.
func tailText(raw string) string {
	joined := strings.Join(strings.Fields(raw), " ")
	runes := []rune(joined)
	if len(runes) > stderrTailRunes {
		return "..." + string(runes[len(runes)-stderrTailRunes:])
	}
	return joined
}

// splitLines returns the client's non-empty output lines, without carriage
// returns.
func splitLines(out string) []string {
	raw := strings.Split(out, "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

// firstLine returns the client's first output line, trimmed.
func firstLine(out string) string {
	lines := splitLines(out)
	if len(lines) == 0 {
		return ""
	}
	return strings.TrimSpace(lines[0])
}

// parseUsers decodes batch, tab-separated User/Host rows, dropping the
// anonymous and system accounts the API never exposes.
func parseUsers(out string) []User {
	users := make([]User, 0, 8)
	for _, line := range splitLines(out) {
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		user := strings.TrimSpace(parts[0])
		host := strings.TrimSpace(parts[1])
		if user == "" || host == "" || IsSystemUser(user) {
			continue
		}
		users = append(users, User{User: user, Host: host})
	}
	return users
}
