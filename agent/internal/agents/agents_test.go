package agents

import (
	"context"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestFindSpec(t *testing.T) {
	tests := []struct {
		input    string
		wantID   string
		found    bool
	}{
		{"claude-code", "claude-code", true},
		{"claude", "claude-code", true},
		{"CLAUDE", "claude-code", true},
		{"codex", "codex", true},
		{"openai-codex", "codex", true},
		{"antigravity", "antigravity", true},
		{"agy", "antigravity", true},
		{"opencode", "opencode", true},
		{"opencode-ai", "opencode", true},
		{"nonexistent-agent", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			spec, ok := FindSpec(tt.input)
			if ok != tt.found {
				t.Fatalf("FindSpec(%q) ok = %v, want %v", tt.input, ok, tt.found)
			}
			if ok && spec.ID != tt.wantID {
				t.Errorf("FindSpec(%q) ID = %q, want %q", tt.input, spec.ID, tt.wantID)
			}
		})
	}
}

func TestListAndProbe(t *testing.T) {
	mgr := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()

	list := mgr.List(ctx)
	if len(list) != 4 {
		t.Fatalf("List() returned %d agents, want 4", len(list))
	}

	expectedIDs := map[string]bool{
		"claude-code": false,
		"codex":       false,
		"antigravity": false,
		"opencode":    false,
	}

	for _, a := range list {
		if _, ok := expectedIDs[a.ID]; !ok {
			t.Errorf("Unexpected agent in list: %s", a.ID)
		}
		expectedIDs[a.ID] = true
		if a.Name == "" {
			t.Errorf("Agent %s has empty Name", a.ID)
		}
		if a.Command == "" {
			t.Errorf("Agent %s has empty Command", a.ID)
		}
		if len(a.Capabilities) == 0 {
			t.Errorf("Agent %s has empty Capabilities", a.ID)
		}
	}

	for id, found := range expectedIDs {
		if !found {
			t.Errorf("Agent %s was not found in List()", id)
		}
	}
}

func TestInstallAndUninstallDryRun(t *testing.T) {
	mgr := New(config.Config{DryRun: true}, nil)
	ctx := context.Background()
	log := func(level, msg string) {}

	// Test dry run install on all specs
	for _, spec := range Specs {
		if err := mgr.Install(ctx, log, spec.ID); err != nil {
			t.Fatalf("Install dry-run failed for %s: %v", spec.ID, err)
		}
		if err := mgr.Uninstall(ctx, log, spec.ID); err != nil {
			t.Fatalf("Uninstall dry-run failed for %s: %v", spec.ID, err)
		}
	}

	// Unknown agent
	if err := mgr.Install(ctx, log, "invalid-agent"); err == nil {
		t.Fatal("Install expected error for invalid-agent, got nil")
	}
	if err := mgr.Uninstall(ctx, log, "invalid-agent"); err == nil {
		t.Fatal("Uninstall expected error for invalid-agent, got nil")
	}
}
