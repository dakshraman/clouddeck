// Package safeexec runs external commands with explicit argument arrays
// (never a shell string) and streams their output into task logs.
package safeexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const (
	timeout   = 5 * time.Minute
	tailLines = 5
)

// Logger receives one log line; levels are "info", "warn" or "error".
// It is an alias so any func(level, message string) is assignable.
type Logger = func(level, message string)

// Run executes name with args, streaming stdout and stderr into log. In
// dry-run mode nothing is executed and the command is only logged.
func Run(ctx context.Context, dryRun bool, log Logger, name string, args ...string) error {
	return RunTimeout(ctx, dryRun, log, timeout, name, args...)
}

// RunTimeout is Run with an explicit per-command timeout (package installs
// and downloads can legitimately run longer than the default).
func RunTimeout(ctx context.Context, dryRun bool, log Logger, commandTimeout time.Duration, name string, args ...string) error {
	command := formatCommand(name, args)
	if dryRun {
		log("info", "dry-run: would run: "+command)
		return nil
	}
	path, err := exec.LookPath(name)
	if err != nil {
		return fmt.Errorf("executable %q is not installed on this server", name)
	}
	log("info", "exec: "+command)

	ctx, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, args...)
	stdout := &lineWriter{log: log, level: "info"}
	stderr := &lineWriter{log: log, level: "warn"}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	runErr := cmd.Run()
	stdout.flush()
	stderr.flush()

	if runErr == nil {
		return nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("command %s timed out after %s", command, commandTimeout)
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return fmt.Errorf("command %s canceled", command)
	}
	if detail := stderr.tailText(); detail != "" {
		return fmt.Errorf("command %s failed: %w: %s", command, runErr, detail)
	}
	return fmt.Errorf("command %s failed: %w", command, runErr)
}

func formatCommand(name string, args []string) string {
	var b strings.Builder
	b.WriteString(quoteIfNeeded(name))
	for _, arg := range args {
		b.WriteByte(' ')
		b.WriteString(quoteIfNeeded(arg))
	}
	return b.String()
}

func quoteIfNeeded(arg string) string {
	if strings.ContainsAny(arg, " \t\"'") {
		return strconv.Quote(arg)
	}
	return arg
}

// lineWriter splits stream output into lines, logging each one and keeping a
// small tail for error context.
type lineWriter struct {
	log   Logger
	level string
	buf   []byte
	tail  []string
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.buf = append(w.buf, p...)
	for {
		i := bytes.IndexByte(w.buf, '\n')
		if i < 0 {
			break
		}
		w.emit(string(w.buf[:i]))
		w.buf = w.buf[i+1:]
	}
	return len(p), nil
}

func (w *lineWriter) flush() {
	if len(w.buf) > 0 {
		w.emit(string(w.buf))
		w.buf = nil
	}
}

func (w *lineWriter) emit(line string) {
	line = strings.TrimRight(line, "\r")
	if strings.TrimSpace(line) == "" {
		return
	}
	w.log(w.level, line)
	w.tail = append(w.tail, line)
	if len(w.tail) > tailLines {
		w.tail = w.tail[len(w.tail)-tailLines:]
	}
}

func (w *lineWriter) tailText() string {
	return strings.Join(w.tail, " | ")
}
