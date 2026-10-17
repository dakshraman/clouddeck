package mail

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
)

// passwdEntry is one parsed Dovecot passwd-file line: the frozen 8
// colon-separated fields plus the optional space-separated
// userdb_quota_rule field.
type passwdEntry struct {
	fields     [8]string
	quotaBytes int64
	hasQuota   bool
}

func (e passwdEntry) email() string { return e.fields[0] }
func (e passwdEntry) home() string  { return e.fields[5] }

// String renders the frozen layout
// "user@domain.com:{SHA256}<base64>:5000:5000::<home>::" and appends the
// quota rule only when one is set (quotaMb > 0 on write).
func (e passwdEntry) String() string {
	line := strings.Join(e.fields[:], ":")
	if e.hasQuota {
		line += fmt.Sprintf(" userdb_quota_rule=*:bytes=%d", e.quotaBytes)
	}
	return line
}

// newPasswdEntry builds one entry with the frozen uid/gid values.
func newPasswdEntry(email, hash, home string, quotaMB int64) passwdEntry {
	entry := passwdEntry{fields: [8]string{email, hash, defaultUID, defaultGID, "", home, "", ""}}
	if quotaMB > 0 {
		entry.hasQuota = true
		entry.quotaBytes = quotaMB * bytesPerMB
	}
	return entry
}

// hashPassword renders the frozen {SHA256}<base64> password hash.
func hashPassword(password string) string {
	sum := sha256.Sum256([]byte(password))
	return "{SHA256}" + base64.StdEncoding.EncodeToString(sum[:])
}

// parsePasswdLine decodes one line; false when it is blank, a comment or not
// the frozen 8-field shape. Lines that do not parse are preserved verbatim
// when a file is rewritten.
func parsePasswdLine(line string) (passwdEntry, bool) {
	line = strings.TrimSpace(strings.TrimRight(line, "\r"))
	if line == "" || strings.HasPrefix(line, "#") {
		return passwdEntry{}, false
	}
	entryText := line
	var quotaBytes int64
	hasQuota := false
	if i := strings.IndexAny(line, " \t"); i >= 0 {
		entryText = line[:i]
		for _, field := range strings.Fields(line[i:]) {
			if n, ok := parseQuotaRule(field); ok {
				quotaBytes, hasQuota = n, true
			}
		}
	}
	parts := strings.Split(entryText, ":")
	if len(parts) != 8 || parts[0] == "" {
		return passwdEntry{}, false
	}
	entry := passwdEntry{quotaBytes: quotaBytes, hasQuota: hasQuota}
	copy(entry.fields[:], parts)
	return entry, true
}

// parseQuotaRule decodes the extra passwd-file field
// "userdb_quota_rule=*:bytes=<n>".
func parseQuotaRule(field string) (int64, bool) {
	const prefix = "userdb_quota_rule="
	if !strings.HasPrefix(field, prefix) {
		return 0, false
	}
	rest := field[len(prefix):]
	i := strings.Index(rest, "bytes=")
	if i < 0 {
		return 0, false
	}
	n, err := strconv.ParseInt(strings.TrimSpace(rest[i+len("bytes="):]), 10, 64)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}
