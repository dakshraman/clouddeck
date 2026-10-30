package mysql

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"

	"clouddeck/agent/internal/apierr"
)

// Export executes mysqldump for the named database with options
// --single-transaction --quick --skip-lock-tables and streams stdout to w.
func (s *Service) Export(ctx context.Context, rawName string, w io.Writer) error {
	name, err := ValidateDatabase(rawName)
	if err != nil {
		return err
	}
	exists, err := s.databaseExists(ctx, name)
	if err != nil {
		return err
	}
	if !exists {
		return apierr.NotFound("not_found", fmt.Sprintf("database %q does not exist", name))
	}

	dumpBin := s.cfg.MySQLDumpBin
	if dumpBin == "" {
		dumpBin = "mysqldump"
	}
	path, err := exec.LookPath(dumpBin)
	if err != nil {
		return apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			fmt.Sprintf("mysqldump client %q is not installed on this server", dumpBin))
	}

	args := []string{"--single-transaction", "--quick", "--skip-lock-tables", "-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, name)

	cmd := exec.CommandContext(ctx, path, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	cmd.Stdout = w
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	if runErr == nil {
		return nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		if errors.Is(ctxErr, context.DeadlineExceeded) {
			return apierr.New(http.StatusInternalServerError, "mysql_error", "mysqldump timed out")
		}
		return apierr.New(http.StatusInternalServerError, "mysql_error", "mysqldump invocation canceled")
	}

	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("mysqldump failed: %v", runErr)
	}
	if isUnavailable(stderr.String()) {
		return apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			"mysql server is not reachable: "+detail)
	}
	return apierr.New(http.StatusInternalServerError, "mysql_error", detail)
}

// Import executes mysql <name> reading SQL from r and applying it to the database.
// If the input stream is gzip compressed, it is transparently decompressed.
func (s *Service) Import(ctx context.Context, rawName string, r io.Reader) error {
	name, err := ValidateDatabase(rawName)
	if err != nil {
		return err
	}
	exists, err := s.databaseExists(ctx, name)
	if err != nil {
		return err
	}
	if !exists {
		return apierr.NotFound("not_found", fmt.Sprintf("database %q does not exist", name))
	}

	bin := s.cfg.MySQLBin
	if bin == "" {
		bin = "mysql"
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			fmt.Sprintf("mysql client %q is not installed on this server", bin))
	}

	args := []string{"-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, name)

	br := bufio.NewReader(r)
	var reader io.Reader = br
	magic, err := br.Peek(2)
	if err == nil && len(magic) == 2 && magic[0] == 0x1f && magic[1] == 0x8b {
		gz, err := gzip.NewReader(br)
		if err != nil {
			return apierr.BadRequest("invalid_gzip", fmt.Sprintf("invalid gzip header: %v", err))
		}
		defer gz.Close()
		reader = gz
	}

	cmd := exec.CommandContext(ctx, path, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	cmd.Stdin = reader
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	if runErr == nil {
		return s.record("mysql.db.import", map[string]any{"database": name})
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		if errors.Is(ctxErr, context.DeadlineExceeded) {
			return apierr.New(http.StatusInternalServerError, "mysql_error", "mysql client timed out")
		}
		return apierr.New(http.StatusInternalServerError, "mysql_error", "mysql client invocation canceled")
	}

	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("mysql client failed: %v", runErr)
	}
	if isUnavailable(stderr.String()) {
		return apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			"mysql server is not reachable: "+detail)
	}
	return apierr.New(http.StatusInternalServerError, "mysql_error", detail)
}
