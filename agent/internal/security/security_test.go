package security

import (
	"reflect"
	"testing"
)

// Real fail2ban-client output uses ASCII tree prefixes; the parsers must see
// through them or every jail on a live host would look empty.
const jailListOut = "Status\n|- Number of jail:\t2\n`- Jail list:\tsshd, nginx-http-auth\n"

func TestParseJailListRealOutput(t *testing.T) {
	got := parseJailList(jailListOut)
	want := []string{"nginx-http-auth", "sshd"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseJailList = %v, want %v", got, want)
	}
}

func TestParseJailListEmpty(t *testing.T) {
	if got := parseJailList("Status\n|- Number of jail:\t0\n`- Jail list:\t\n"); len(got) != 0 {
		t.Fatalf("parseJailList = %v, want empty", got)
	}
	if got := parseJailList("garbage"); len(got) != 0 {
		t.Fatalf("parseJailList(garbage) = %v, want empty", got)
	}
}

const jailStatusOut = "Status for the jail: sshd\n" +
	"|- Filter\n" +
	"|  |- Currently failed:\t1\n" +
	"|  `- Total failed:\t9\n" +
	"`- Actions\n" +
	"   |- Currently banned:\t2\n" +
	"   |- Total banned:\t7\n" +
	"   `- Banned IP list:\t203.0.113.50 198.51.100.7\n"

func TestParseJailStatusRealOutput(t *testing.T) {
	banned, total, ips := parseJailStatus(jailStatusOut)
	if banned != 2 {
		t.Fatalf("banned = %d, want 2", banned)
	}
	if total != 7 {
		t.Fatalf("total = %d, want 7", total)
	}
	want := []string{"203.0.113.50", "198.51.100.7"}
	if !reflect.DeepEqual(ips, want) {
		t.Fatalf("ips = %v, want %v", ips, want)
	}
}

func TestParseJailStatusEmpty(t *testing.T) {
	banned, total, ips := parseJailStatus("Status for the jail: sshd\n`- Actions\n")
	if banned != 0 || total != 0 || len(ips) != 0 {
		t.Fatalf("empty status = (%d, %d, %v), want zeroes", banned, total, ips)
	}
}

func TestTrimTree(t *testing.T) {
	cases := map[string]string{
		"|- Currently banned:\t1": "Currently banned:\t1",
		"`- Jail list:\tsshd":     "Jail list:\tsshd",
		"   |- Total banned: 3":   "Total banned: 3",
		"plain":                   "plain",
	}
	for in, want := range cases {
		if got := trimTree(in); got != want {
			t.Fatalf("trimTree(%q) = %q, want %q", in, got, want)
		}
	}
}
