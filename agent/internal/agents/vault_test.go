package agents

import (
	"context"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestVaultLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	v := &Vault{
		cfg:      config.Config{DryRun: true},
		filePath: filepath.Join(tmpDir, "keys.json"),
		cached:   make(map[string]string),
	}

	ctx := context.Background()

	// Initial state
	keys := v.GetMaskedKeys(ctx)
	if len(keys) == 0 {
		t.Fatalf("expected supported keys in empty vault")
	}
	for _, k := range keys {
		if k.IsSet {
			t.Errorf("key %s should not be set initially", k.Name)
		}
	}

	// Set keys
	err := v.SetKeys(ctx, map[string]string{
		"ANTHROPIC_API_KEY": "sk-ant-api03-abcdef1234567890",
		"OPENAI_API_KEY":    "sk-proj-xyz9876543210",
		"OLLAMA_HOST":       "http://127.0.0.1:11434",
	})
	if err != nil {
		t.Fatalf("SetKeys failed: %v", err)
	}

	// Verify masked values
	keys = v.GetMaskedKeys(ctx)
	for _, k := range keys {
		if k.Name == "ANTHROPIC_API_KEY" {
			if !k.IsSet {
				t.Errorf("ANTHROPIC_API_KEY should be set")
			}
			if k.MaskedVal != "sk-ant-••••••••7890" {
				t.Errorf("unexpected masked value: %s", k.MaskedVal)
			}
		}
	}

	// Verify environment injection
	env := v.GetEnvironment()
	if len(env) != 3 {
		t.Errorf("expected 3 environment variables, got %d", len(env))
	}

	// Verify raw key
	if raw := v.GetRawKey("OLLAMA_HOST"); raw != "http://127.0.0.1:11434" {
		t.Errorf("GetRawKey(OLLAMA_HOST) = %s, want http://127.0.0.1:11434", raw)
	}

	// Delete key
	_ = v.SetKeys(ctx, map[string]string{
		"OPENAI_API_KEY": "",
	})
	if raw := v.GetRawKey("OPENAI_API_KEY"); raw != "" {
		t.Errorf("expected OPENAI_API_KEY to be deleted, got %s", raw)
	}
}

func TestMaskValue(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"short", "••••••••"},
		{"sk-1234567890", "sk-••••••••7890"},
		{"sk-ant-abcdefghijklmnop", "sk-ant-••••••••mnop"},
	}

	for _, tt := range tests {
		got := MaskValue(tt.input)
		if got != tt.want {
			t.Errorf("MaskValue(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
