// Package dns manages PowerDNS zones and records for the DNS endpoints.
// Every pdnsutil invocation is serialized behind a mutex and uses argument
// arrays only - never a shell. Mutations are written to the audit log.
// See docs/api.md section 1.4.
package dns

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	stdlog "log"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Limits from docs/api.md section 1.4.
const (
	// commandTimeout bounds every pdnsutil invocation.
	commandTimeout = 30 * time.Second
	// stderrTailRunes is how much pdnsutil stderr is echoed into API errors.
	stderrTailRunes = 300
	// maxRecordNameLen is the longest accepted record name.
	maxRecordNameLen = 253
	// maxContentLen is the longest accepted record content.
	maxContentLen = 512
	// maxTTL is the largest accepted TTL (one week). 0 asks PowerDNS for its
	// default TTL and is never passed to pdnsutil.
	maxTTL = 604800
)

// Audit actions owned by this package.
const (
	ActionZoneCreate   = "dns.zone.create"
	ActionZoneDelete   = "dns.zone.delete"
	ActionRecordAdd    = "dns.record.add"
	ActionRecordDelete = "dns.record.delete"
)

// zoneRe is the frozen zone validation regex from docs/api.md.
var zoneRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

// recordNameRe matches relative record names; the apex is "@" and handled
// separately.
var recordNameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$`)

// recordTypes lists the record types the API accepts.
var recordTypes = map[string]struct{}{
	"A": {}, "AAAA": {}, "CNAME": {}, "MX": {},
	"TXT": {}, "NS": {}, "SRV": {}, "CAA": {},
}

// Zone is one DNS zone.
type Zone struct {
	Name string `json:"name"`
}

// Record is one record; Name is relative to the zone ("@" = apex).
type Record struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	TTL     int    `json:"ttl"`
	Content string `json:"content"`
}

// Status reports whether the PowerDNS tooling is usable.
type Status struct {
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
	ConfDir   string `json:"confDir,omitempty"`
}

// Manager talks to PowerDNS through pdnsutil.
type Manager struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.Mutex
}

// New creates the manager.
func New(cfg config.Config, auditLog *audit.Log) *Manager {
	return &Manager{cfg: cfg, audit: auditLog}
}

// Status probes pdnsutil availability. Never fails: a missing or unusable
// binary reports available=false.
func (m *Manager) Status(ctx context.Context) Status {
	status := Status{ConfDir: m.cfg.PdnsConfDir}
	out, _, err := m.run(ctx, "--version")
	if err != nil {
		return status
	}
	status.Available = true
	status.Version = pdnsVersion(out)
	return status
}

// Zones lists all zones. 503 dns_unavailable when pdnsutil is missing.
func (m *Manager) Zones(ctx context.Context) ([]Zone, error) {
	out, _, err := m.run(ctx, "list-all-zones")
	if err != nil {
		return nil, err
	}
	zones := make([]Zone, 0, 16)
	for _, line := range splitLines(out) {
		// pdnsutil prints DNS names either way across versions; store the
		// bare lowercase name the API validates against.
		name := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(line), "."))
		if name == "" {
			continue
		}
		zones = append(zones, Zone{Name: name})
	}
	return zones, nil
}

// CreateZone creates a native zone (SOA included). Errors: 400
// invalid_zone, 409 zone_exists / dry_run, 503 dns_unavailable.
func (m *Manager) CreateZone(ctx context.Context, name string) (Zone, error) {
	if m.cfg.DryRun {
		return Zone{}, dryRunErr()
	}
	params := map[string]any{"zone": name}
	zone, err := validateZone(name)
	if err != nil {
		return Zone{}, m.reject(ActionZoneCreate, params, err)
	}
	params["zone"] = zone
	_, stderr, runErr := m.run(ctx, "create-zone", zone)
	if runErr != nil {
		if isZoneExists(stderr) {
			return Zone{}, m.reject(ActionZoneCreate, params,
				apierr.Conflict("zone_exists", fmt.Sprintf("zone %q already exists", zone)))
		}
		return Zone{}, m.reject(ActionZoneCreate, params, runErr)
	}
	if err := m.record(ActionZoneCreate, params); err != nil {
		return Zone{}, err
	}
	return Zone{Name: zone}, nil
}

// DeleteZone deletes a zone. Errors: 400 invalid_zone, 404
// zone_not_found, 409 dry_run, 503 dns_unavailable.
func (m *Manager) DeleteZone(ctx context.Context, name string) error {
	if m.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"zone": name}
	zone, err := validateZone(name)
	if err != nil {
		return m.reject(ActionZoneDelete, params, err)
	}
	params["zone"] = zone
	_, stderr, runErr := m.run(ctx, "delete-zone", zone)
	if runErr != nil {
		if isMissing(stderr) {
			return m.reject(ActionZoneDelete, params, zoneNotFound(zone))
		}
		return m.reject(ActionZoneDelete, params, runErr)
	}
	return m.record(ActionZoneDelete, params)
}

// Records lists one zone's records (SOA/NS included; Name relative).
func (m *Manager) Records(ctx context.Context, zone string) ([]Record, error) {
	z, err := validateZone(zone)
	if err != nil {
		return nil, err
	}
	out, stderr, runErr := m.run(ctx, "list-zone", z)
	if runErr != nil {
		if isMissing(stderr) {
			return nil, zoneNotFound(z)
		}
		return nil, runErr
	}
	return parseRecords(z, out), nil
}

// AddRecord adds a record. Errors: 400 invalid_record, 404
// zone_not_found, 409 dry_run, 503 dns_unavailable.
func (m *Manager) AddRecord(ctx context.Context, zone, name, rtype, content string, ttl int) (Record, error) {
	if m.cfg.DryRun {
		return Record{}, dryRunErr()
	}
	params := map[string]any{"zone": zone, "name": name, "type": rtype, "ttl": ttl, "content": content}
	z, err := validateZone(zone)
	if err != nil {
		return Record{}, m.reject(ActionRecordAdd, params, err)
	}
	n, t, err := validateRecord(name, rtype, content, ttl)
	if err != nil {
		return Record{}, m.reject(ActionRecordAdd, params, err)
	}
	params["zone"], params["name"], params["type"] = z, n, t

	args := []string{"add-record", z, n, t}
	if ttl > 0 {
		// pdnsutil expects the optional TTL before the content arguments.
		args = append(args, strconv.Itoa(ttl))
	}
	args = append(args, pdnsContent(t, content))

	_, stderr, runErr := m.run(ctx, args...)
	if runErr != nil {
		if isMissing(stderr) {
			return Record{}, m.reject(ActionRecordAdd, params, zoneNotFound(z))
		}
		return Record{}, m.reject(ActionRecordAdd, params, runErr)
	}
	if err := m.record(ActionRecordAdd, params); err != nil {
		return Record{}, err
	}
	return Record{Name: n, Type: t, TTL: ttl, Content: content}, nil
}

// DeleteRRSet deletes the whole record set for name/type. Errors: 400
// invalid_record, 404 zone_not_found / record_not_found, 409 dry_run,
// 503 dns_unavailable.
func (m *Manager) DeleteRRSet(ctx context.Context, zone, name, rtype string) error {
	if m.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"zone": zone, "name": name, "type": rtype}
	z, err := validateZone(zone)
	if err != nil {
		return m.reject(ActionRecordDelete, params, err)
	}
	n, err := validateRecordName(name)
	if err != nil {
		return m.reject(ActionRecordDelete, params, err)
	}
	t, err := validateRecordType(rtype)
	if err != nil {
		return m.reject(ActionRecordDelete, params, err)
	}
	params["zone"], params["name"], params["type"] = z, n, t

	// pdnsutil delete-rrset succeeds even when the RRset is absent, so the
	// zone and the RRset are checked through list-zone first to keep the
	// documented 404s.
	out, stderr, runErr := m.run(ctx, "list-zone", z)
	if runErr != nil {
		if isMissing(stderr) {
			return m.reject(ActionRecordDelete, params, zoneNotFound(z))
		}
		return m.reject(ActionRecordDelete, params, runErr)
	}
	if !hasRRSet(parseRecords(z, out), n, t) {
		return m.reject(ActionRecordDelete, params, apierr.NotFound("record_not_found",
			fmt.Sprintf("record %q type %q does not exist in zone %q", n, t, z)))
	}
	_, stderr, runErr = m.run(ctx, "delete-rrset", z, n, t)
	if runErr != nil {
		if isMissing(stderr) {
			return m.reject(ActionRecordDelete, params, zoneNotFound(z))
		}
		return m.reject(ActionRecordDelete, params, runErr)
	}
	return m.record(ActionRecordDelete, params)
}

// run invokes the configured pdnsutil binary with args, prefixing
// --config-dir when one is configured. Invocations are serialized behind the
// manager mutex and time-limited. stderr is returned even on failure so
// callers can classify the documented conditions (zone exists, zone missing)
// before falling back to the generic errors: a missing binary is a 503
// dns_unavailable, anything else a 500 dns_error with the stderr tail.
func (m *Manager) run(ctx context.Context, args ...string) (string, string, error) {
	path, err := exec.LookPath(m.cfg.PdnsUtilBin)
	if err != nil {
		return "", "", apierr.New(http.StatusServiceUnavailable, "dns_unavailable",
			fmt.Sprintf("pdnsutil %q is not installed on this server", m.cfg.PdnsUtilBin))
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()

	argv := make([]string, 0, len(args)+2)
	if m.cfg.PdnsConfDir != "" {
		argv = append(argv, "--config-dir", m.cfg.PdnsConfDir)
	}
	argv = append(argv, args...)

	cmd := exec.CommandContext(ctx, path, argv...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	out, errOut := stdout.String(), stderr.String()
	if runErr == nil {
		return out, errOut, nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		if errors.Is(ctxErr, context.DeadlineExceeded) {
			return out, errOut, apierr.New(http.StatusInternalServerError, "dns_error",
				fmt.Sprintf("pdnsutil timed out after %s", commandTimeout))
		}
		return out, errOut, apierr.New(http.StatusInternalServerError, "dns_error", "pdnsutil invocation canceled")
	}

	detail := tailText(errOut)
	if detail == "" {
		detail = fmt.Sprintf("pdnsutil failed: %v", runErr)
	}
	return out, errOut, apierr.New(http.StatusInternalServerError, "dns_error", detail)
}

// record appends the accepted audit entry for a mutation. When the write
// fails the mutation itself is already applied to PowerDNS, so that is logged
// loudly and surfaced as a 500; callers treat the operation as failed.
func (m *Manager) record(action string, params map[string]any) error {
	if err := m.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}); err != nil {
		stdlog.Printf("dns: WARNING: %s %v already applied to PowerDNS but writing the audit log failed: %v", action, params, err)
		return apierr.Internal(fmt.Sprintf("write audit log: %v (the change may already be applied)", err))
	}
	return nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (m *Manager) reject(action string, params map[string]any, err error) error {
	if auditErr := m.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("dns: write audit log: %v", auditErr)
	}
	return err
}

// dryRunErr is the frozen reply of every mutation in dry-run mode.
func dryRunErr() error {
	return apierr.Conflict("dry_run", "DNS management is disabled in dry-run mode")
}

// validateZone lowercases and checks raw against the frozen zone pattern.
func validateZone(raw string) (string, error) {
	zone := strings.ToLower(strings.TrimSpace(raw))
	if !zoneRe.MatchString(zone) {
		return "", apierr.BadRequest("invalid_zone", fmt.Sprintf("zone %q is not a valid DNS zone name", raw))
	}
	return zone, nil
}

// validateRecord normalizes and checks one record's fields.
func validateRecord(rawName, rawType, content string, ttl int) (name, rtype string, err error) {
	name, err = validateRecordName(rawName)
	if err != nil {
		return "", "", err
	}
	rtype, err = validateRecordType(rawType)
	if err != nil {
		return "", "", err
	}
	if err := validateTTL(ttl); err != nil {
		return "", "", err
	}
	if err := validateRecordContent(content); err != nil {
		return "", "", err
	}
	return name, rtype, nil
}

// validateRecordName lowercases and checks a relative record name; "@" is
// the zone apex.
func validateRecordName(raw string) (string, error) {
	name := strings.ToLower(strings.TrimSpace(raw))
	if name == "@" {
		return name, nil
	}
	if len(name) > maxRecordNameLen || !recordNameRe.MatchString(name) {
		return "", apierr.BadRequest("invalid_record", fmt.Sprintf("record name %q must be \"@\" or dot-separated labels", raw))
	}
	return name, nil
}

// validateRecordType uppercases and checks an RR type against the accepted
// set.
func validateRecordType(raw string) (string, error) {
	rtype := strings.ToUpper(strings.TrimSpace(raw))
	if _, ok := recordTypes[rtype]; !ok {
		return "", apierr.BadRequest("invalid_record", fmt.Sprintf("record type %q is not supported", raw))
	}
	return rtype, nil
}

// validateTTL checks the TTL range; 0 asks PowerDNS for its default TTL.
func validateTTL(ttl int) error {
	if ttl < 0 || ttl > maxTTL {
		return apierr.BadRequest("invalid_record", fmt.Sprintf("ttl %d is outside 0-%d", ttl, maxTTL))
	}
	return nil
}

// validateRecordContent checks the content length and character limits.
func validateRecordContent(content string) error {
	if content == "" {
		return apierr.BadRequest("invalid_record", "record content must not be empty")
	}
	if utf8.RuneCountInString(content) > maxContentLen {
		return apierr.BadRequest("invalid_record", fmt.Sprintf("record content is longer than %d characters", maxContentLen))
	}
	if hasControlChars(content) {
		return apierr.BadRequest("invalid_record", "record content must not contain control characters")
	}
	return nil
}

// hasControlChars reports whether s contains ASCII control characters,
// including NUL and DEL.
func hasControlChars(s string) bool {
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return true
		}
	}
	return false
}

// zoneNotFound is the documented 404 for an unknown zone.
func zoneNotFound(zone string) error {
	return apierr.NotFound("zone_not_found", fmt.Sprintf("zone %q does not exist", zone))
}

// isZoneExists reports whether pdnsutil refused to create a zone because it
// already exists ("Zone 'x' exists already").
func isZoneExists(stderr string) bool {
	lower := strings.ToLower(stderr)
	return strings.Contains(lower, "exists already") || strings.Contains(lower, "already exists")
}

// isMissing reports whether pdnsutil failed because the zone was unknown
// ("Zone 'x' not found!", "Zone 'x' does not exist").
func isMissing(stderr string) bool {
	lower := strings.ToLower(stderr)
	return strings.Contains(lower, "not found") || strings.Contains(lower, "does not exist")
}

// pdnsContent renders a record's content for pdnsutil: TXT values are quoted
// and escaped for PowerDNS, every other type is passed unchanged.
func pdnsContent(rtype, content string) string {
	if rtype == "TXT" {
		return quoteTXT(content)
	}
	return content
}

// parseRecords decodes pdnsutil list-zone output: one
// "name TTL IN TYPE content" line per record, with "$ORIGIN" headers and ";"
// comments skipped. Names become zone-relative ("@" for the apex) and TXT
// contents lose the quoting PowerDNS stores them with.
func parseRecords(zone, out string) []Record {
	records := make([]Record, 0, 16)
	for _, line := range splitLines(out) {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "$") {
			continue
		}
		name, ttlText, class, rtype, content, ok := splitRecordLine(line)
		if !ok || !strings.EqualFold(class, "IN") {
			continue
		}
		ttl, err := strconv.Atoi(ttlText)
		if err != nil || ttl < 0 {
			continue
		}
		record := Record{
			Name:    relativeName(zone, name),
			Type:    strings.ToUpper(rtype),
			TTL:     ttl,
			Content: content,
		}
		if record.Type == "TXT" {
			record.Content = unquoteTXT(record.Content)
		}
		records = append(records, record)
	}
	return records
}

// splitRecordLine splits one list-zone line into its five fields. Only the
// first four are whitespace-delimited: TXT and SOA contents contain spaces.
func splitRecordLine(line string) (name, ttl, class, rtype, content string, ok bool) {
	rest := strings.TrimSpace(line)
	fields := make([]string, 0, 4)
	for len(fields) < 4 {
		cut := strings.IndexFunc(rest, unicode.IsSpace)
		if cut < 0 {
			return "", "", "", "", "", false
		}
		fields = append(fields, rest[:cut])
		rest = strings.TrimLeftFunc(rest[cut:], unicode.IsSpace)
	}
	content = strings.TrimSpace(rest)
	if content == "" {
		return "", "", "", "", "", false
	}
	return fields[0], fields[1], fields[2], fields[3], content, true
}

// relativeName maps a fully qualified record name to the zone-relative form
// the API returns. DNS names are case-insensitive, so the result is
// lowercased; "@" is the zone apex.
func relativeName(zone, name string) string {
	fqdn := strings.ToLower(strings.TrimSuffix(name, "."))
	if fqdn == zone {
		return "@"
	}
	if rel, found := strings.CutSuffix(fqdn, "."+zone); found {
		return rel
	}
	return fqdn
}

// hasRRSet reports whether records contain the name/type pair.
func hasRRSet(records []Record, name, rtype string) bool {
	for _, record := range records {
		if record.Name == name && record.Type == rtype {
			return true
		}
	}
	return false
}

// quoteTXT renders content as a PowerDNS TXT zone representation: the value
// is wrapped in quotes with backslashes and quotes escaped. unquoteTXT
// undoes this on the read path.
func quoteTXT(content string) string {
	var b strings.Builder
	b.Grow(len(content) + 2)
	b.WriteByte('"')
	for i := 0; i < len(content); i++ {
		switch c := content[i]; c {
		case '"', '\\':
			b.WriteByte('\\')
			b.WriteByte(c)
		default:
			b.WriteByte(c)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// unquoteTXT converts a PowerDNS TXT zone representation into the plain
// value the API returns: surrounding quotes are removed and backslash
// escapes (\" , \\ and \DDD) are decoded.
func unquoteTXT(content string) string {
	if len(content) < 2 || content[0] != '"' || content[len(content)-1] != '"' {
		return content
	}
	inner := content[1 : len(content)-1]
	var b strings.Builder
	b.Grow(len(inner))
	for i := 0; i < len(inner); i++ {
		if inner[i] != '\\' || i+1 >= len(inner) {
			b.WriteByte(inner[i])
			continue
		}
		if i+3 < len(inner) && isDigit(inner[i+1]) && isDigit(inner[i+2]) && isDigit(inner[i+3]) {
			value := int(inner[i+1]-'0')*100 + int(inner[i+2]-'0')*10 + int(inner[i+3]-'0')
			if value <= 255 {
				b.WriteByte(byte(value))
				i += 3
				continue
			}
		}
		i++
		b.WriteByte(inner[i])
	}
	return b.String()
}

// isDigit reports whether c is an ASCII digit.
func isDigit(c byte) bool {
	return c >= '0' && c <= '9'
}

// tailText collapses raw to a single line and keeps its last stderrTailRunes
// characters, which is where pdnsutil puts the actual failure.
func tailText(raw string) string {
	joined := strings.Join(strings.Fields(raw), " ")
	runes := []rune(joined)
	if len(runes) > stderrTailRunes {
		return "..." + string(runes[len(runes)-stderrTailRunes:])
	}
	return joined
}

// splitLines returns pdnsutil's non-empty output lines, without carriage
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

// firstLine returns pdnsutil's first output line, trimmed.
func firstLine(out string) string {
	lines := splitLines(out)
	if len(lines) == 0 {
		return ""
	}
	return strings.TrimSpace(lines[0])
}

// pdnsVersion extracts the bare version from "pdnsutil 4.9.0".
func pdnsVersion(out string) string {
	return strings.TrimSpace(strings.TrimPrefix(firstLine(out), "pdnsutil "))
}
