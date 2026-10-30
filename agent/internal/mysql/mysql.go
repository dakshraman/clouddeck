// Package mysql implements database and user management by driving the local
// mariadb/mysql client binary with argument arrays only (never a shell) and
// building every SQL statement from validated identifiers. All mutations are
// audited. See docs/api.md section 1.2.
package mysql

import (
	"context"
	"fmt"
	stdlog "log"
	"sort"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Status is the GET /v1/mysql/status payload.
type Status struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Kind      string `json:"kind"`
}

// Database is one schema.
type Database struct {
	Name string `json:"name"`
}

// User is one account, identified by its user and host pair.
type User struct {
	User string `json:"user"`
	Host string `json:"host"`
}

// CreatedUser is the POST /v1/mysql/users response. Password is present only
// when the agent generated it.
type CreatedUser struct {
	User     string `json:"user"`
	Host     string `json:"host"`
	Password string `json:"password,omitempty"`
}

// Service coordinates MySQL management operations.
type Service struct {
	audit *audit.Log
	cfg   config.Config
}

// New creates the MySQL service.
func New(auditLog *audit.Log, cfg config.Config) *Service {
	return &Service{audit: auditLog, cfg: cfg}
}

// Status probes the server with SELECT VERSION(). It never fails: a missing
// client binary or an unreachable server yields available=false.
func (s *Service) Status() Status {
	out, err := s.run(context.Background(), "SELECT VERSION()")
	if err != nil {
		return Status{}
	}
	version := firstLine(out)
	kind := "mysql"
	if strings.Contains(strings.ToLower(version), "mariadb") {
		kind = "mariadb"
	}
	return Status{Available: true, Version: version, Kind: kind}
}

// ListDatabases returns every non-system schema, sorted by name.
func (s *Service) ListDatabases(ctx context.Context) ([]Database, error) {
	out, err := s.run(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, 16)
	for _, line := range splitLines(out) {
		name := strings.TrimSpace(line)
		if name == "" || IsSystemSchema(name) {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)

	databases := make([]Database, 0, len(names))
	for _, name := range names {
		databases = append(databases, Database{Name: name})
	}
	return databases, nil
}

// ListUsers returns every non-system account, sorted by user then host.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	out, err := s.run(ctx, "SELECT User, Host FROM mysql.user")
	if err != nil {
		return nil, err
	}
	users := parseUsers(out)
	sort.Slice(users, func(i, j int) bool {
		if users[i].User != users[j].User {
			return users[i].User < users[j].User
		}
		return users[i].Host < users[j].Host
	})
	return users, nil
}

// CreateDatabase creates the schema and audits the mutation.
func (s *Service) CreateDatabase(ctx context.Context, rawName string) (Database, error) {
	name, err := ValidateDatabase(rawName)
	if err != nil {
		return Database{}, err
	}
	exists, err := s.databaseExists(ctx, name)
	if err != nil {
		return Database{}, err
	}
	if exists {
		return Database{}, apierr.Conflict("exists", fmt.Sprintf("database %q already exists", name))
	}
	if _, err := s.run(ctx, "CREATE DATABASE `"+name+"`"); err != nil {
		return Database{}, err
	}
	if err := s.record("mysql.db.create", map[string]any{"database": name}); err != nil {
		return Database{}, err
	}
	return Database{Name: name}, nil
}

// DeleteDatabase drops the schema and audits the mutation.
func (s *Service) DeleteDatabase(ctx context.Context, rawName string) (string, error) {
	name, err := ValidateDatabase(rawName)
	if err != nil {
		return "", err
	}
	exists, err := s.databaseExists(ctx, name)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", apierr.NotFound("not_found", fmt.Sprintf("database %q does not exist", name))
	}
	if _, err := s.run(ctx, "DROP DATABASE `"+name+"`"); err != nil {
		return "", err
	}
	if err := s.record("mysql.db.delete", map[string]any{"database": name}); err != nil {
		return "", err
	}
	return name, nil
}

// CreateUser creates the account and audits the mutation. An empty password
// makes the agent generate one, returned exactly once in the response.
func (s *Service) CreateUser(ctx context.Context, rawUser, password, rawHost string) (CreatedUser, error) {
	user, err := ValidateUser(rawUser)
	if err != nil {
		return CreatedUser{}, err
	}
	host, err := ValidateHost(rawHost)
	if err != nil {
		return CreatedUser{}, err
	}
	generated := false
	if password == "" {
		password, err = generatePassword()
		if err != nil {
			return CreatedUser{}, apierr.Internal(fmt.Sprintf("generate password: %v", err))
		}
		generated = true
	} else if err := checkPassword(password); err != nil {
		return CreatedUser{}, err
	}

	exists, err := s.userExists(ctx, user, host)
	if err != nil {
		return CreatedUser{}, err
	}
	if exists {
		return CreatedUser{}, apierr.Conflict("exists", fmt.Sprintf("user %q@%q already exists", user, host))
	}
	// Safe to embed in quotes: the validated charsets exclude quotes and
	// backslashes, so no extra escaping is ever needed.
	sql := fmt.Sprintf("CREATE USER '%s'@'%s' IDENTIFIED BY '%s'", user, host, password)
	if _, err := s.run(ctx, sql); err != nil {
		return CreatedUser{}, err
	}
	if err := s.record("mysql.user.create", map[string]any{"user": user, "host": host}); err != nil {
		return CreatedUser{}, err
	}

	created := CreatedUser{User: user, Host: host}
	if generated {
		created.Password = password
	}
	return created, nil
}

// DeleteUser drops the account and audits the mutation.
func (s *Service) DeleteUser(ctx context.Context, rawUser, rawHost string) (User, error) {
	user, err := ValidateUser(rawUser)
	if err != nil {
		return User{}, err
	}
	host, err := ValidateHost(rawHost)
	if err != nil {
		return User{}, err
	}
	exists, err := s.userExists(ctx, user, host)
	if err != nil {
		return User{}, err
	}
	if !exists {
		return User{}, apierr.NotFound("not_found", fmt.Sprintf("user %q@%q does not exist", user, host))
	}
	if _, err := s.run(ctx, fmt.Sprintf("DROP USER '%s'@'%s'", user, host)); err != nil {
		return User{}, err
	}
	if err := s.record("mysql.user.delete", map[string]any{"user": user, "host": host}); err != nil {
		return User{}, err
	}
	return User{User: user, Host: host}, nil
}

// Grant gives a user ALL PRIVILEGES on one database and audits the mutation.
// Both identifiers must already exist and privileges must be "all".
func (s *Service) Grant(ctx context.Context, rawUser, rawHost, rawDatabase, privileges string) error {
	user, err := ValidateUser(rawUser)
	if err != nil {
		return err
	}
	host, err := ValidateHost(rawHost)
	if err != nil {
		return err
	}
	database, err := ValidateDatabase(rawDatabase)
	if err != nil {
		return err
	}

	userOK, err := s.userExists(ctx, user, host)
	if err != nil {
		return err
	}
	if !userOK {
		return apierr.NotFound("user", fmt.Sprintf("user %q@%q does not exist", user, host))
	}
	dbOK, err := s.databaseExists(ctx, database)
	if err != nil {
		return err
	}
	if !dbOK {
		return apierr.NotFound("database", fmt.Sprintf("database %q does not exist", database))
	}
	if strings.TrimSpace(privileges) != "all" {
		return apierr.BadRequest("privileges", fmt.Sprintf("unsupported privileges %q: only \"all\" is allowed", privileges))
	}

	if _, err := s.run(ctx, fmt.Sprintf("GRANT ALL PRIVILEGES ON `%s`.* TO '%s'@'%s'", database, user, host)); err != nil {
		return err
	}
	if _, err := s.run(ctx, "FLUSH PRIVILEGES"); err != nil {
		return err
	}
	return s.record("mysql.grant", map[string]any{
		"user": user, "host": host, "database": database, "privileges": "all",
	})
}

// databaseExists runs the listing query and reports, case-insensitively
// (matching how the denylists compare), whether the schema is present.
func (s *Service) databaseExists(ctx context.Context, name string) (bool, error) {
	out, err := s.run(ctx, "SHOW DATABASES")
	if err != nil {
		return false, err
	}
	for _, line := range splitLines(out) {
		if strings.EqualFold(strings.TrimSpace(line), name) {
			return true, nil
		}
	}
	return false, nil
}

// userExists runs the account listing query and reports whether the user@host
// pair is present.
func (s *Service) userExists(ctx context.Context, user, host string) (bool, error) {
	out, err := s.run(ctx, "SELECT User, Host FROM mysql.user")
	if err != nil {
		return false, err
	}
	for _, u := range parseUsers(out) {
		if strings.EqualFold(u.User, user) && strings.EqualFold(u.Host, host) {
			return true, nil
		}
	}
	return false, nil
}

// record appends the accepted audit entry for a mutation. When the write
// fails the mutation itself may already be applied, so that is logged loudly
// and surfaced as a 500; callers treat the operation as failed.
func (s *Service) record(action string, params map[string]any) error {
	if s.audit == nil {
		return nil
	}
	if err := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}); err != nil {
		stdlog.Printf("mysql: WARNING: %s %v already applied to the server but writing the audit log failed: %v", action, params, err)
		return apierr.Internal(fmt.Sprintf("write audit log: %v (the change may already be applied)", err))
	}
	return nil
}
