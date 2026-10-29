package server

import "testing"

func TestNormalizeUpdateVersion(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"", "", true},
		{"0.6.10", "0.6.10", true},
		{"v0.6.10", "0.6.10", true},
		{" 1.2.3 ", "1.2.3", true},
		{"latest", "", false},
		{"0.6", "", false},
		{"0.6.9-rc1", "", false},
	}
	for _, c := range cases {
		got, err := normalizeUpdateVersion(c.in)
		if c.ok {
			if err != nil || got != c.want {
				t.Errorf("normalizeUpdateVersion(%q) = %q, %v; want %q", c.in, got, err, c.want)
			}
			continue
		}
		if err == nil {
			t.Errorf("normalizeUpdateVersion(%q) = %q, nil; want an error", c.in, got)
		}
	}
}

func TestShellQuote(t *testing.T) {
	if got := shellQuote("/var/lib/clouddeck/agent/update.log"); got != "'/var/lib/clouddeck/agent/update.log'" {
		t.Fatalf("shellQuote = %s", got)
	}
	if got := shellQuote("it's"); got != `'it'\''s'` {
		t.Fatalf("shellQuote with quote = %s", got)
	}
}
