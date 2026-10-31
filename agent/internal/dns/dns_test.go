package dns

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// newTestManager wires a manager whose audit log lives in a temp dir.
func newTestManager(t *testing.T, cfg config.Config) (*Manager, string) {
	t.Helper()
	auditDir := t.TempDir()
	auditLog, err := audit.Open(auditDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	return New(cfg, auditLog), auditDir
}

// assertAPIErr asserts err is an *apierr.Error with the wanted status/code.
func assertAPIErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Status != status || apiErr.Code != code {
		t.Fatalf("got %d/%s, want %d/%s (message %q)", apiErr.Status, apiErr.Code, status, code, apiErr.Message)
	}
}

// assertAuditContains fails when the audit log lacks any of wants.
func assertAuditContains(t *testing.T, auditDir string, wants ...string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(auditDir, "audit.log"))
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	for _, want := range wants {
		if !strings.Contains(string(data), want) {
			t.Errorf("audit log missing %s: %s", want, data)
		}
	}
}

// checkValue asserts the result of a zone validation call: either the
// normalized value with no error, or a 400 with the wanted code.
func checkValue(t *testing.T, got string, err error, want, wantCode string) {
	t.Helper()
	if wantCode == "" {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
		return
	}
	if err == nil {
		t.Fatalf("got %q with nil error, want error code %q", got, wantCode)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Code != wantCode || apiErr.Status != 400 {
		t.Fatalf("error = %d/%s, want 400/%s", apiErr.Status, apiErr.Code, wantCode)
	}
}

// checkRecordValue asserts the result of a record validation call: either the
// normalized name/type pair with no error, or a 400 with the wanted code.
func checkRecordValue(t *testing.T, name, rtype string, err error, wantName, wantType, wantCode string) {
	t.Helper()
	if wantCode == "" {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if name != wantName || rtype != wantType {
			t.Fatalf("got %q/%q, want %q/%q", name, rtype, wantName, wantType)
		}
		return
	}
	if err == nil {
		t.Fatalf("got %q/%q with nil error, want error code %q", name, rtype, wantCode)
	}
	apiErr, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an *apierr.Error", err)
	}
	if apiErr.Code != wantCode || apiErr.Status != 400 {
		t.Fatalf("error = %d/%s, want 400/%s", apiErr.Status, apiErr.Code, wantCode)
	}
}

// fakeReply is one canned pdnsutil response: stdout, stderr and exit code.
type fakeReply struct {
	out  string
	err  string
	code int
}

// writeFakePdnsutil writes an executable stub pdnsutil that appends its argv
// to a log and answers the configured subcommands with canned output. A
// leading "--config-dir <dir>" pair is ignored, mirroring how the real binary
// accepts it as a global option. An unconfigured subcommand exits 9 with a
// diagnostic, so tests fail loudly when an unexpected command runs.
func writeFakePdnsutil(t *testing.T, replies map[string]fakeReply) (bin, argvFile string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake pdnsutil script requires a POSIX shell")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not found")
	}
	dir := t.TempDir()
	argvFile = filepath.Join(dir, "argv.txt")

	commands := make([]string, 0, len(replies))
	for cmd := range replies {
		commands = append(commands, cmd)
	}
	sort.Strings(commands)

	var cases strings.Builder
	for i, cmd := range commands {
		reply := replies[cmd]
		outFile := filepath.Join(dir, fmt.Sprintf("out-%d.txt", i))
		errFile := filepath.Join(dir, fmt.Sprintf("err-%d.txt", i))
		if err := os.WriteFile(outFile, []byte(reply.out), 0o644); err != nil {
			t.Fatalf("write fake stdout: %v", err)
		}
		if err := os.WriteFile(errFile, []byte(reply.err), 0o644); err != nil {
			t.Fatalf("write fake stderr: %v", err)
		}
		fmt.Fprintf(&cases, "  %s)\n    cat %s\n    cat %s >&2\n    exit %d\n    ;;\n",
			shQuote(cmd), shQuote(outFile), shQuote(errFile), reply.code)
	}

	script := "#!/bin/sh\n" +
		"printf '%s\\n' '---' \"$@\" >> " + shQuote(argvFile) + "\n" +
		"if [ \"$1\" = \"--config-dir\" ]; then shift 2; fi\n" +
		"cmd=$1\n" +
		"case \"$cmd\" in\n" + cases.String() + "esac\n" +
		"echo \"fake pdnsutil: unexpected command: $*\" >&2\n" +
		"exit 9\n"

	bin = filepath.Join(dir, "fake-pdnsutil")
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pdnsutil: %v", err)
	}
	return bin, argvFile
}

// readArgvs returns the argv of every invocation the fake recorded.
func readArgvs(t *testing.T, argvFile string) [][]string {
	t.Helper()
	data, err := os.ReadFile(argvFile)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatalf("read fake argv: %v", err)
	}
	var calls [][]string
	for _, block := range strings.Split(string(data), "---\n") {
		block = strings.TrimRight(block, "\n")
		if block == "" {
			continue
		}
		calls = append(calls, strings.Split(block, "\n"))
	}
	return calls
}

// shQuote wraps s in single quotes for POSIX sh.
func shQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func TestValidateZone(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		want     string
		wantCode string
	}{
		{name: "simple", input: "example.com", want: "example.com"},
		{name: "subdomain", input: "sub.example.co.uk", want: "sub.example.co.uk"},
		{name: "mixed case lowercased", input: "Example.COM", want: "example.com"},
		{name: "trims whitespace", input: "  example.com  ", want: "example.com"},
		{name: "max label length", input: strings.Repeat("a", 63) + ".com", want: strings.Repeat("a", 63) + ".com"},
		{name: "dash inside label", input: "my-zone.example.com", want: "my-zone.example.com"},
		{name: "digits", input: "0.example1.com", want: "0.example1.com"},
		{name: "empty", input: "", wantCode: "invalid_zone"},
		{name: "single label", input: "example", wantCode: "invalid_zone"},
		{name: "trailing dot", input: "example.com.", wantCode: "invalid_zone"},
		{name: "leading dot", input: ".example.com", wantCode: "invalid_zone"},
		{name: "empty label", input: "example..com", wantCode: "invalid_zone"},
		{name: "label starts with dash", input: "-example.com", wantCode: "invalid_zone"},
		{name: "label ends with dash", input: "example-.com", wantCode: "invalid_zone"},
		{name: "label too long", input: strings.Repeat("a", 64) + ".com", wantCode: "invalid_zone"},
		{name: "space inside", input: "exa mple.com", wantCode: "invalid_zone"},
		{name: "underscore", input: "under_score.com", wantCode: "invalid_zone"},
		{name: "wildcard", input: "*.example.com", wantCode: "invalid_zone"},
		{name: "non ascii", input: "café.example", wantCode: "invalid_zone"},
		{name: "shell metacharacters", input: "example.com; rm -rf /", wantCode: "invalid_zone"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateZone(tt.input)
			checkValue(t, got, err, tt.want, tt.wantCode)
		})
	}
}

func TestValidateRecord(t *testing.T) {
	maxName := strings.Repeat("a", 63) + "." + strings.Repeat("b", 63) + "." + strings.Repeat("c", 63) + "." + strings.Repeat("d", 61) // 253 chars
	tests := []struct {
		name     string
		rawName  string
		rawType  string
		content  string
		ttl      int
		wantName string
		wantType string
		wantCode string
	}{
		{name: "apex A", rawName: "@", rawType: "A", content: "192.0.2.1", wantName: "@", wantType: "A"},
		{name: "single label lowercased", rawName: "WWW", rawType: "a", content: "192.0.2.1", ttl: 300, wantName: "www", wantType: "A"},
		{name: "multi label uppercase type", rawName: "a-b.c-d", rawType: "AAAA", content: "2001:db8::1", ttl: 604800, wantName: "a-b.c-d", wantType: "AAAA"},
		{name: "trims whitespace", rawName: "  www  ", rawType: " txt ", content: "hello", wantName: "www", wantType: "TXT"},
		{name: "content 512 chars", rawName: "www", rawType: "TXT", content: strings.Repeat("x", 512), wantName: "www", wantType: "TXT"},
		{name: "name 253 chars", rawName: maxName, rawType: "A", content: "192.0.2.1", wantName: maxName, wantType: "A"},
		{name: "underscore label allowed", rawName: "_dmarc", rawType: "TXT", content: "v=DMARC1; p=none", wantName: "_dmarc", wantType: "TXT"},
		{name: "dkim selector label", rawName: "default._domainkey", rawType: "TXT", content: "v=DKIM1; k=rsa", ttl: 300, wantName: "default._domainkey", wantType: "TXT"},
		{name: "empty name", rawName: "", rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "wildcard name", rawName: "*", rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "double underscore name", rawName: "__dmarc", rawType: "TXT", content: "v=DMARC1", wantCode: "invalid_record"},
		{name: "trailing underscore label", rawName: "dmarc_", rawType: "TXT", content: "v=DMARC1", wantCode: "invalid_record"},
		{name: "trailing dot name", rawName: "www.", rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "empty label", rawName: "www..x", rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "name too long", rawName: maxName + "x", rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "label too long", rawName: strings.Repeat("a", 64), rawType: "A", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "unsupported type", rawName: "www", rawType: "HTTPS", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "empty type", rawName: "www", rawType: "", content: "192.0.2.1", wantCode: "invalid_record"},
		{name: "negative ttl", rawName: "www", rawType: "A", content: "192.0.2.1", ttl: -1, wantCode: "invalid_record"},
		{name: "ttl too large", rawName: "www", rawType: "A", content: "192.0.2.1", ttl: 604801, wantCode: "invalid_record"},
		{name: "empty content", rawName: "www", rawType: "A", content: "", wantCode: "invalid_record"},
		{name: "content too long", rawName: "www", rawType: "TXT", content: strings.Repeat("x", 513), wantCode: "invalid_record"},
		{name: "content with newline", rawName: "www", rawType: "TXT", content: "a\nb", wantCode: "invalid_record"},
		{name: "content with tab", rawName: "www", rawType: "TXT", content: "a\tb", wantCode: "invalid_record"},
		{name: "content with nul", rawName: "www", rawType: "TXT", content: "a\x00b", wantCode: "invalid_record"},
		{name: "content with del", rawName: "www", rawType: "TXT", content: "a\x7fb", wantCode: "invalid_record"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name, rtype, err := validateRecord(tt.rawName, tt.rawType, tt.content, tt.ttl)
			checkRecordValue(t, name, rtype, err, tt.wantName, tt.wantType, tt.wantCode)
		})
	}
}

func TestValidateRecordTypeAcceptsDocumentedTypes(t *testing.T) {
	for _, rtype := range []string{"A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"} {
		got, err := validateRecordType(strings.ToLower(rtype))
		if err != nil || got != rtype {
			t.Errorf("validateRecordType(%q) = %q, %v; want %q", rtype, got, err, rtype)
		}
	}
}

func TestTXTQuotingRoundTrip(t *testing.T) {
	for _, value := range []string{
		"hello world",
		`say "hi" and \ backslash`,
		"café with ümlauts",
		"double  spaces",
		"semicolon; and brackets [x]",
	} {
		if got := unquoteTXT(quoteTXT(value)); got != value {
			t.Errorf("round trip %q = %q, want unchanged", value, got)
		}
	}
	if got, want := unquoteTXT(`"caf\195\169"`), "café"; got != want {
		t.Errorf("unquoteTXT escape decoding = %q, want %q", got, want)
	}
	if got, want := unquoteTXT("plain"), "plain"; got != want {
		t.Errorf("unquoteTXT(%q) = %q, want unchanged", "plain", got)
	}
}

func TestStatusReportsVersion(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"--version": {out: "pdnsutil 4.9.0\n"},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin, PdnsConfDir: "/etc/powerdns"})
	status := mgr.Status(context.Background())
	if !status.Available || status.Version != "4.9.0" || status.ConfDir != "/etc/powerdns" {
		t.Fatalf("Status = %+v, want available with version 4.9.0 and the conf dir", status)
	}
}

func TestMissingBinaryIs503(t *testing.T) {
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: "clouddeck-no-such-pdnsutil"})
	ctx := context.Background()

	calls := []struct {
		name string
		call func() error
	}{
		{"Zones", func() error { _, err := mgr.Zones(ctx); return err }},
		{"CreateZone", func() error { _, err := mgr.CreateZone(ctx, "example.com"); return err }},
		{"DeleteZone", func() error { return mgr.DeleteZone(ctx, "example.com") }},
		{"Records", func() error { _, err := mgr.Records(ctx, "example.com"); return err }},
		{"AddRecord", func() error { _, err := mgr.AddRecord(ctx, "example.com", "www", "A", "192.0.2.1", 0); return err }},
		{"DeleteRRSet", func() error { return mgr.DeleteRRSet(ctx, "example.com", "www", "A") }},
	}
	for _, tt := range calls {
		t.Run(tt.name, func(t *testing.T) {
			assertAPIErr(t, tt.call(), 503, "dns_unavailable")
		})
	}

	status := mgr.Status(ctx)
	if status.Available || status.Version != "" {
		t.Fatalf("Status = %+v, want available=false without a version", status)
	}
}

func TestDryRunBlocksMutations(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
		"list-zone":      {out: "$ORIGIN .\n"},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin, DryRun: true})
	ctx := context.Background()

	// Reads stay available in dry-run mode.
	if _, err := mgr.Zones(ctx); err != nil {
		t.Fatalf("Zones in dry-run: %v", err)
	}
	if _, err := mgr.Records(ctx, "example.com"); err != nil {
		t.Fatalf("Records in dry-run: %v", err)
	}

	_, err := mgr.CreateZone(ctx, "example.com")
	assertAPIErr(t, err, 409, "dry_run")
	err = mgr.DeleteZone(ctx, "example.com")
	assertAPIErr(t, err, 409, "dry_run")
	_, err = mgr.AddRecord(ctx, "example.com", "www", "A", "192.0.2.1", 0)
	assertAPIErr(t, err, 409, "dry_run")
	err = mgr.DeleteRRSet(ctx, "example.com", "www", "A")
	assertAPIErr(t, err, 409, "dry_run")

	want := [][]string{{"list-all-zones"}, {"list-zone", "example.com"}}
	if calls := readArgvs(t, argvFile); !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want only the reads %v", calls, want)
	}
}

func TestZonesParsesListAllZones(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"list-all-zones": {out: "example.com\nb.example.org\ndot.example.\n\nUPPER.EXAMPLE\n"},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	zones, err := mgr.Zones(context.Background())
	if err != nil {
		t.Fatalf("Zones: %v", err)
	}
	want := []Zone{{Name: "example.com"}, {Name: "b.example.org"}, {Name: "dot.example"}, {Name: "upper.example"}}
	if !reflect.DeepEqual(zones, want) {
		t.Fatalf("Zones = %+v, want %+v", zones, want)
	}
}

func TestZonesPassesConfigDirFirst(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"list-all-zones": {out: "example.com\n"},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin, PdnsConfDir: "/etc/powerdns"})
	if _, err := mgr.Zones(context.Background()); err != nil {
		t.Fatalf("Zones: %v", err)
	}
	calls := readArgvs(t, argvFile)
	want := [][]string{{"--config-dir", "/etc/powerdns", "list-all-zones"}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v", calls, want)
	}
}

func TestRecordsParsesListZoneOutput(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"list-zone": {out: "$ORIGIN .\n" +
			"; comment\n" +
			"\n" +
			"example.com.\t3600\tIN\tSOA\ta.misconfigured.dns.server.invalid hostmaster.example.com 0 10800 3600 604800 3600\n" +
			"example.com.\t3600\tIN\tNS\tns1.example.com.\n" +
			"WWW.Example.com.\t300\tIN\tA\t192.0.2.10\n" +
			"sub.example.com.\t120\tIN\tTXT\t\"hello world\"\n" +
			"example.com.\t90\tIN\tTXT\t\"say \\\"hi\\\" and \\\\ backslash\"\n" +
			"example.com.\t60\tIN\tMX\t10 mail.example.com.\n" +
			"example.com.\t3600\tIN\tA\n" +
			"not a record line\n"},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	records, err := mgr.Records(context.Background(), "Example.COM")
	if err != nil {
		t.Fatalf("Records: %v", err)
	}
	want := []Record{
		{Name: "@", Type: "SOA", TTL: 3600, Content: "a.misconfigured.dns.server.invalid hostmaster.example.com 0 10800 3600 604800 3600"},
		{Name: "@", Type: "NS", TTL: 3600, Content: "ns1.example.com."},
		{Name: "www", Type: "A", TTL: 300, Content: "192.0.2.10"},
		{Name: "sub", Type: "TXT", TTL: 120, Content: "hello world"},
		{Name: "@", Type: "TXT", TTL: 90, Content: `say "hi" and \ backslash`},
		{Name: "@", Type: "MX", TTL: 60, Content: "10 mail.example.com."},
	}
	if !reflect.DeepEqual(records, want) {
		t.Fatalf("Records = %+v, want %+v", records, want)
	}
}

func TestRecordsUnknownZoneIs404(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"list-zone": {err: "Zone 'gone.example' not found!\n", code: 1},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	_, err := mgr.Records(context.Background(), "gone.example")
	assertAPIErr(t, err, 404, "zone_not_found")
}

func TestCreateZoneExistsIs409(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"create-zone": {err: "Zone 'example.com' exists already\n", code: 1},
	})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	_, err := mgr.CreateZone(context.Background(), "Example.COM")
	assertAPIErr(t, err, 409, "zone_exists")

	calls := readArgvs(t, argvFile)
	want := [][]string{{"create-zone", "example.com"}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v", calls, want)
	}
	assertAuditContains(t, auditDir, `"action":"dns.zone.create"`, `"result":"rejected"`)
}

func TestCreateZoneAuditsAccepted(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{"create-zone": {}})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	zone, err := mgr.CreateZone(context.Background(), "example.com")
	if err != nil {
		t.Fatalf("CreateZone: %v", err)
	}
	if zone.Name != "example.com" {
		t.Fatalf("zone = %+v, want example.com", zone)
	}
	assertAuditContains(t, auditDir, `"action":"dns.zone.create"`, `"result":"accepted"`, `"zone":"example.com"`)
}

func TestDeleteZoneUnknownIs404(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"delete-zone": {err: "Zone 'gone.example' not found!\n", code: 1},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	err := mgr.DeleteZone(context.Background(), "gone.example")
	assertAPIErr(t, err, 404, "zone_not_found")
}

func TestDeleteZoneAuditsAccepted(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{"delete-zone": {}})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	if err := mgr.DeleteZone(context.Background(), "example.com"); err != nil {
		t.Fatalf("DeleteZone: %v", err)
	}
	calls := readArgvs(t, argvFile)
	want := [][]string{{"delete-zone", "example.com"}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v", calls, want)
	}
	assertAuditContains(t, auditDir, `"action":"dns.zone.delete"`, `"result":"accepted"`)
}

func TestAddRecordPassesUpstreamArgv(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{"add-record": {}})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	record, err := mgr.AddRecord(context.Background(), "example.com", "WWW", "txt", "hello world", 300)
	if err != nil {
		t.Fatalf("AddRecord: %v", err)
	}
	wantRecord := Record{Name: "www", Type: "TXT", TTL: 300, Content: "hello world"}
	if record != wantRecord {
		t.Fatalf("record = %+v, want %+v", record, wantRecord)
	}
	// pdnsutil expects add-record ZONE NAME TYPE [TTL] CONTENT, with TXT
	// contents quoted.
	calls := readArgvs(t, argvFile)
	want := [][]string{{"add-record", "example.com", "www", "TXT", "300", `"hello world"`}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v", calls, want)
	}
	assertAuditContains(t, auditDir, `"action":"dns.record.add"`, `"result":"accepted"`, `"content":"hello world"`)
}

func TestAddRecordOmitsZeroTTL(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{"add-record": {}})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	if _, err := mgr.AddRecord(context.Background(), "example.com", "@", "A", "192.0.2.1", 0); err != nil {
		t.Fatalf("AddRecord: %v", err)
	}
	calls := readArgvs(t, argvFile)
	want := [][]string{{"add-record", "example.com", "@", "A", "192.0.2.1"}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v (no ttl argument for 0)", calls, want)
	}
}

func TestAddRecordUnknownZoneIs404(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"add-record": {err: "Zone 'gone.example' does not exist\n", code: 1},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	_, err := mgr.AddRecord(context.Background(), "gone.example", "www", "A", "192.0.2.1", 0)
	assertAPIErr(t, err, 404, "zone_not_found")
}

func TestDeleteRRSetDeletesExisting(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"list-zone": {out: "$ORIGIN .\n" +
			"example.com.\t3600\tIN\tSOA\tns1.example.com hostmaster.example.com 0 10800 3600 604800 3600\n" +
			"www.example.com.\t300\tIN\tA\t192.0.2.1\n"},
		"delete-rrset": {},
	})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	if err := mgr.DeleteRRSet(context.Background(), "example.com", "WWW", "a"); err != nil {
		t.Fatalf("DeleteRRSet: %v", err)
	}
	calls := readArgvs(t, argvFile)
	want := [][]string{
		{"list-zone", "example.com"},
		{"delete-rrset", "example.com", "www", "A"},
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want %v", calls, want)
	}
	assertAuditContains(t, auditDir, `"action":"dns.record.delete"`, `"result":"accepted"`)
}

func TestDeleteRRSetMissingIs404(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"list-zone": {out: "$ORIGIN .\n" +
			"example.com.\t3600\tIN\tSOA\tns1.example.com hostmaster.example.com 0 10800 3600 604800 3600\n"},
		"delete-rrset": {},
	})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	err := mgr.DeleteRRSet(context.Background(), "example.com", "www", "A")
	assertAPIErr(t, err, 404, "record_not_found")

	// pdnsutil delete-rrset exits 0 for an absent RRset, so the stub must
	// not have been invoked.
	calls := readArgvs(t, argvFile)
	want := [][]string{{"list-zone", "example.com"}}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("invocations = %v, want only %v", calls, want)
	}
	assertAuditContains(t, auditDir, `"action":"dns.record.delete"`, `"result":"rejected"`)
}

func TestDeleteRRSetUnknownZoneIs404(t *testing.T) {
	bin, _ := writeFakePdnsutil(t, map[string]fakeReply{
		"list-zone": {err: "Zone 'gone.example' not found!\n", code: 1},
	})
	mgr, _ := newTestManager(t, config.Config{PdnsUtilBin: bin})
	err := mgr.DeleteRRSet(context.Background(), "gone.example", "www", "A")
	assertAPIErr(t, err, 404, "zone_not_found")
}

func TestMutationsValidateBeforeRunning(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"create-zone": {}, "add-record": {}, "delete-zone": {}, "delete-rrset": {}, "list-zone": {},
	})
	mgr, auditDir := newTestManager(t, config.Config{PdnsUtilBin: bin})
	ctx := context.Background()

	_, err := mgr.CreateZone(ctx, "not a zone")
	assertAPIErr(t, err, 400, "invalid_zone")

	_, err = mgr.AddRecord(ctx, "example.com", "bad*name", "A", "192.0.2.1", 0)
	assertAPIErr(t, err, 400, "invalid_record")
	_, err = mgr.AddRecord(ctx, "example.com", "www", "HTTPS", "192.0.2.1", 0)
	assertAPIErr(t, err, 400, "invalid_record")
	_, err = mgr.AddRecord(ctx, "example.com", "www", "TXT", "line\nbreak", 0)
	assertAPIErr(t, err, 400, "invalid_record")
	_, err = mgr.AddRecord(ctx, "example.com", "www", "A", "192.0.2.1", 604801)
	assertAPIErr(t, err, 400, "invalid_record")

	err = mgr.DeleteRRSet(ctx, "example.com", "bad name", "A")
	assertAPIErr(t, err, 400, "invalid_record")
	err = mgr.DeleteRRSet(ctx, "example.com", "www", "BOGUS")
	assertAPIErr(t, err, 400, "invalid_record")

	if calls := readArgvs(t, argvFile); len(calls) != 0 {
		t.Fatalf("pdnsutil ran for invalid input: %v", calls)
	}
	assertAuditContains(t, auditDir, `"action":"dns.zone.create"`, `"action":"dns.record.add"`, `"result":"rejected"`)
}

func TestNameservers(t *testing.T) {
	mgr, _ := newTestManager(t, config.Config{
		Nameserver1: "ns1.old.com",
		Nameserver2: "ns2.old.com",
		ServerIP:    "10.0.0.1",
	})
	ctx := context.Background()

	info := mgr.GetNameservers(ctx)
	if info.Nameserver1 != "ns1.old.com" || info.Nameserver2 != "ns2.old.com" || info.ServerIP != "10.0.0.1" {
		t.Fatalf("unexpected nameservers info: %+v", info)
	}

	if err := mgr.SetNameservers(ctx, "ns1.new.com", "ns2.new.com"); err != nil {
		t.Fatalf("SetNameservers: %v", err)
	}

	info = mgr.GetNameservers(ctx)
	if info.Nameserver1 != "ns1.new.com" || info.Nameserver2 != "ns2.new.com" || info.ServerIP != "10.0.0.1" {
		t.Fatalf("unexpected updated nameservers info: %+v", info)
	}
}

func TestCreateZoneCreatesDefaultRecords(t *testing.T) {
	bin, argvFile := writeFakePdnsutil(t, map[string]fakeReply{
		"create-zone": {},
		"add-record":  {},
	})
	mgr, _ := newTestManager(t, config.Config{
		PdnsUtilBin: bin,
		Nameserver1: "ns1.example.com",
		Nameserver2: "ns2.example.com",
		ServerIP:    "192.0.2.1",
	})
	ctx := context.Background()

	zone, err := mgr.CreateZone(ctx, "example.com")
	if err != nil {
		t.Fatalf("CreateZone: %v", err)
	}
	if zone.Name != "example.com" {
		t.Fatalf("zone = %+v, want example.com", zone)
	}

	calls := readArgvs(t, argvFile)
	want := [][]string{
		{"create-zone", "example.com"},
		{"add-record", "example.com", "@", "NS", "3600", "ns1.example.com"},
		{"add-record", "example.com", "@", "NS", "3600", "ns2.example.com"},
		{"add-record", "example.com", "@", "A", "300", "192.0.2.1"},
		{"add-record", "example.com", "www", "CNAME", "300", "@"},
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls = %v, want %v", calls, want)
	}
}
