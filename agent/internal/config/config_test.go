package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresAgentTokenOutsideDevelopment(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "")
	t.Setenv("AGENT_DRY_RUN", "false")
	t.Setenv("AGENT_ALLOW_INSECURE_DEV", "false")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AGENT_AUTH_TOKEN") {
		t.Fatalf("Load() error = %v, want missing token error", err)
	}
}

func TestLoadAllowsExplicitInsecureDevelopment(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "")
	t.Setenv("AGENT_DRY_RUN", "false")
	t.Setenv("AGENT_ALLOW_INSECURE_DEV", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.AllowInsecureDev {
		t.Fatal("AllowInsecureDev = false, want true")
	}
}

func TestLoadRejectsUnsafeResourceLimitValues(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	t.Setenv("AGENT_APP_MEMORY_MAX", "512M\nExecStart=/bin/sh")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AGENT_APP_MEMORY_MAX") {
		t.Fatalf("Load() error = %v, want invalid resource-limit error", err)
	}
}
