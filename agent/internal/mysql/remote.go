// v0.5: remote MySQL access — clone a local user's credentials and grants to
// an additional host so the user can connect from other machines.
// See docs/api.md section 1.9.
package mysql

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// remoteHostsQuery lists every account whose host is not one of the local
// host patterns. Accounts the API never exposes (anonymous and system users)
// are still filtered by parseUsers, mirroring ListUsers.
const remoteHostsQuery = "SELECT User, Host FROM mysql.user WHERE Host NOT IN ('localhost','127.0.0.1','::1') ORDER BY User, Host"

// localHosts are the host values that always mean "this server". They are
// never listed as remote and never accepted as a clone target.
var localHosts = map[string]struct{}{
	"localhost": {},
	"127.0.0.1": {},
	"::1":       {},
}

// RemoteHosts lists every user@host grant whose host is not local.
func (s *Service) RemoteHosts(ctx context.Context) ([]User, error) {
	out, err := s.run(ctx, remoteHostsQuery)
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

// AddRemoteHost creates user@host with the same authentication hash as
// user@localhost and copies its grants. The user must exist on localhost.
func (s *Service) AddRemoteHost(ctx context.Context, rawUser, rawHost string) (User, error) {
	if s.cfg.DryRun {
		return User{}, apierr.Conflict("dry_run", "remote MySQL host operations are disabled in dry-run mode")
	}
	user, err := validateRemoteUser(rawUser)
	if err != nil {
		return User{}, err
	}
	host, err := validateRemoteHost(rawHost)
	if err != nil {
		return User{}, err
	}

	local, err := s.countWhere(ctx, fmt.Sprintf(
		"SELECT COUNT(*) FROM mysql.user WHERE User='%s' AND Host='localhost'", sqlLiteral(user)))
	if err != nil {
		return User{}, err
	}
	if local == 0 {
		return User{}, apierr.NotFound("mysql_user_not_found",
			fmt.Sprintf("local user %q@%q does not exist", user, "localhost"))
	}
	exists, err := s.userExists(ctx, user, host)
	if err != nil {
		return User{}, err
	}
	if exists {
		return User{}, apierr.Conflict("mysql_user_exists",
			fmt.Sprintf("user %q@%q already exists", user, host))
	}

	plugin, hash, err := s.localAuth(ctx, user)
	if err != nil {
		return User{}, err
	}
	if hash == "" {
		return User{}, apierr.BadRequest("invalid_user",
			fmt.Sprintf("local user %q@%q has no password hash", user, "localhost"))
	}

	var create string
	if s.Status().Kind == "mariadb" {
		create = fmt.Sprintf("CREATE USER '%s'@'%s' IDENTIFIED BY PASSWORD '%s'",
			sqlLiteral(user), sqlLiteral(host), sqlLiteral(hash))
	} else {
		if plugin == "" {
			return User{}, apierr.BadRequest("invalid_user",
				fmt.Sprintf("local user %q@%q has no authentication plugin", user, "localhost"))
		}
		create = fmt.Sprintf("CREATE USER '%s'@'%s' IDENTIFIED WITH %s AS '%s'",
			sqlLiteral(user), sqlLiteral(host), plugin, sqlLiteral(hash))
	}
	if _, err := s.run(ctx, create); err != nil {
		return User{}, err
	}
	if err := s.copyGrants(ctx, user, host); err != nil {
		return User{}, err
	}
	if err := s.record("mysql.remote.add", map[string]any{"user": user, "host": host}); err != nil {
		return User{}, err
	}
	return User{User: user, Host: host}, nil
}

// DeleteRemoteHost drops user@host; localhost entries cannot be dropped.
func (s *Service) DeleteRemoteHost(ctx context.Context, rawUser, rawHost string) (User, error) {
	if s.cfg.DryRun {
		return User{}, apierr.Conflict("dry_run", "remote MySQL host operations are disabled in dry-run mode")
	}
	user, err := validateRemoteUser(rawUser)
	if err != nil {
		return User{}, err
	}
	host, err := validateRemoteHost(rawHost)
	if err != nil {
		return User{}, err
	}

	exists, err := s.userExists(ctx, user, host)
	if err != nil {
		return User{}, err
	}
	if !exists {
		return User{}, apierr.NotFound("mysql_user_not_found",
			fmt.Sprintf("user %q@%q does not exist", user, host))
	}
	if _, err := s.run(ctx, fmt.Sprintf("DROP USER '%s'@'%s'", sqlLiteral(user), sqlLiteral(host))); err != nil {
		return User{}, err
	}
	if err := s.record("mysql.remote.delete", map[string]any{"user": user, "host": host}); err != nil {
		return User{}, err
	}
	return User{User: user, Host: host}, nil
}

// validateRemoteUser applies the identifier rules of ValidateUser (same
// regex, same system-user denylist) under the remote API's invalid_user code.
func validateRemoteUser(raw string) (string, error) {
	user := strings.TrimSpace(raw)
	if IsSystemUser(user) || !userRe.MatchString(user) {
		return "", apierr.BadRequest("invalid_user", fmt.Sprintf("invalid user name %q", raw))
	}
	return user, nil
}

// validateRemoteHost applies the host rules and refuses the local host values:
// a remote host entry must be usable from another machine. An empty host
// defaults to localhost, and is therefore refused too.
func validateRemoteHost(raw string) (string, error) {
	host := strings.TrimSpace(raw)
	if host == "" {
		host = "localhost"
	}
	if !hostRe.MatchString(host) {
		return "", apierr.BadRequest("invalid_host", fmt.Sprintf("invalid host %q", raw))
	}
	if _, local := localHosts[strings.ToLower(host)]; local {
		return "", apierr.BadRequest("invalid_host_local",
			fmt.Sprintf("host %q is local; only remote hosts can be managed here", host))
	}
	return host, nil
}

// sqlLiteral escapes a value for embedding inside single quotes. Validated
// user and host values cannot contain quotes, so this is defense in depth.
func sqlLiteral(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

// countWhere runs a COUNT(*) query and returns the first integer of its
// single-row result.
func (s *Service) countWhere(ctx context.Context, sql string) (int, error) {
	out, err := s.run(ctx, sql)
	if err != nil {
		return 0, err
	}
	line := firstLine(out)
	n, err := strconv.Atoi(line)
	if err != nil {
		return 0, apierr.Internal(fmt.Sprintf("mysql: unexpected COUNT(*) output %q", line))
	}
	return n, nil
}

// localAuth reads the authentication plugin and password hash of
// user@localhost (the two columns of the authentication query).
func (s *Service) localAuth(ctx context.Context, user string) (plugin, hash string, err error) {
	out, err := s.run(ctx, fmt.Sprintf(
		"SELECT plugin, authentication_string FROM mysql.user WHERE User='%s' AND Host='localhost'",
		sqlLiteral(user)))
	if err != nil {
		return "", "", err
	}
	parts := strings.Split(firstLine(out), "\t")
	plugin = strings.TrimSpace(parts[0])
	if len(parts) > 1 {
		hash = strings.TrimSpace(parts[1])
	}
	return plugin, hash, nil
}

// copyGrants replays every grant of user@localhost for user@host. Lines that
// do not grant anything to that account are skipped.
func (s *Service) copyGrants(ctx context.Context, user, host string) error {
	out, err := s.run(ctx, fmt.Sprintf("SHOW GRANTS FOR '%s'@'localhost'", sqlLiteral(user)))
	if err != nil {
		return err
	}
	for _, line := range splitLines(out) {
		stmt := translateGrant(line, user, host)
		if stmt == "" {
			continue
		}
		if _, err := s.run(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

// grantLineRe matches a SHOW GRANTS line up to the TO-part account, accepting
// both the single-quoted (MariaDB) and backticked (MySQL) forms. Everything
// after the account — most notably an "IDENTIFIED ..." clause — is captured
// as an opaque tail and dropped when the statement is rebuilt.
var grantLineRe = regexp.MustCompile(
	"^GRANT\\s+(.+?)\\s+ON\\s+(.+?)\\s+TO\\s+(?:'([^']*)'@'([^']*)'|`([^`]*)`@`([^`]*)`)(.*)$")

// translateGrant rewrites one SHOW GRANTS line so that it applies to user@host
// instead of user@localhost, or returns "" when the line does not grant
// anything to that account (or is not parseable).
func translateGrant(line, user, host string) string {
	m := grantLineRe.FindStringSubmatch(strings.TrimSpace(line))
	if m == nil {
		return ""
	}
	grantedUser, grantedHost := m[3], m[4]
	if m[5] != "" || m[6] != "" {
		grantedUser, grantedHost = m[5], m[6]
	}
	if !strings.EqualFold(grantedUser, user) || !strings.EqualFold(grantedHost, "localhost") {
		return ""
	}
	stmt := fmt.Sprintf("GRANT %s ON %s TO '%s'@'%s'", m[1], m[2], sqlLiteral(user), sqlLiteral(host))
	if strings.Contains(strings.ToUpper(m[7]), "WITH GRANT OPTION") {
		stmt += " WITH GRANT OPTION"
	}
	return stmt
}
