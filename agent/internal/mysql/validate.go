package mysql

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// Identifier rules from docs/api.md section 1.2. The password charset is
// deliberately conservative so no SQL escaping is ever needed.
var (
	databaseRe = regexp.MustCompile(`^[A-Za-z0-9_]{1,64}$`)
	userRe     = regexp.MustCompile(`^[A-Za-z0-9_]{1,32}$`)
	hostRe     = regexp.MustCompile(`^[A-Za-z0-9_.%:-]{1,255}$`)
	passwordRe = regexp.MustCompile(`^[A-Za-z0-9!@#$%^&*()_+\-=.,?]{8,64}$`)
)

const (
	// generatedPasswordLen is the fixed length of generated passwords.
	generatedPasswordLen = 20
	// passwordAlphabet is the charset generated passwords draw from.
	passwordAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
)

// systemSchemas are never listed, modified or dropped (case-insensitive).
var systemSchemas = map[string]struct{}{
	"mysql":              {},
	"information_schema": {},
	"performance_schema": {},
	"sys":                {},
}

// systemUsers are never listed, modified or dropped (case-insensitive).
var systemUsers = map[string]struct{}{
	"root":             {},
	"mysql.sys":        {},
	"mysql.session":    {},
	"mysql.infoschema": {},
	"mariadb.sys":      {},
	"debian-sys-maint": {},
}

// IsSystemSchema reports whether name is a protected system schema.
func IsSystemSchema(name string) bool {
	_, ok := systemSchemas[strings.ToLower(name)]
	return ok
}

// IsSystemUser reports whether user is a protected system account.
func IsSystemUser(user string) bool {
	_, ok := systemUsers[strings.ToLower(user)]
	return ok
}

// ValidateDatabase checks a database name against the identifier regex and the
// system schema denylist, returning the name to embed in SQL.
func ValidateDatabase(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if IsSystemSchema(name) {
		return "", apierr.BadRequest("system_schema", fmt.Sprintf("database %q is a system schema", name))
	}
	if !databaseRe.MatchString(name) {
		return "", apierr.BadRequest("invalid_name", fmt.Sprintf("invalid database name %q", raw))
	}
	return name, nil
}

// ValidateUser checks a user name against the identifier regex and the system
// user denylist, returning the name to embed in SQL.
func ValidateUser(raw string) (string, error) {
	user := strings.TrimSpace(raw)
	if IsSystemUser(user) {
		return "", apierr.BadRequest("system_user", fmt.Sprintf("user %q is a system user", user))
	}
	if !userRe.MatchString(user) {
		return "", apierr.BadRequest("invalid_name", fmt.Sprintf("invalid user name %q", raw))
	}
	return user, nil
}

// ValidateHost checks a host pattern, defaulting to localhost when empty.
func ValidateHost(raw string) (string, error) {
	host := strings.TrimSpace(raw)
	if host == "" {
		host = "localhost"
	}
	if !hostRe.MatchString(host) {
		return "", apierr.BadRequest("invalid_name", fmt.Sprintf("invalid host %q", raw))
	}
	return host, nil
}

// checkPassword enforces the documented policy for caller-provided passwords.
func checkPassword(password string) error {
	if !passwordRe.MatchString(password) {
		return apierr.BadRequest("weak_password", "password must be 8-64 characters of A-Z a-z 0-9 or !@#$%^&*()_+-=.,?")
	}
	return nil
}

// generatePassword returns a fresh random password over [A-Za-z0-9].
func generatePassword() (string, error) {
	buf := make([]byte, generatedPasswordLen)
	max := big.NewInt(int64(len(passwordAlphabet)))
	for i := range buf {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("read random bytes: %w", err)
		}
		buf[i] = passwordAlphabet[n.Int64()]
	}
	return string(buf), nil
}
