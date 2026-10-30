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

func TestLoadRejectsInvalidPHPMYADMINRunAs(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	t.Setenv("AGENT_PHPMYADMIN_RUNAS", "user;rm -rf /")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AGENT_PHPMYADMIN_RUNAS") {
		t.Fatalf("Load() error = %v, want invalid AGENT_PHPMYADMIN_RUNAS error", err)
	}
}

func TestLoadRejectsInvalidPHPMYADMINPort(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	t.Setenv("AGENT_PHPMYADMIN_PORT", "99999")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "AGENT_PHPMYADMIN_PORT") {
		t.Fatalf("Load() error = %v, want invalid AGENT_PHPMYADMIN_PORT error", err)
	}
}

func TestLoadParsesPHPMYADMINConfig(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	t.Setenv("AGENT_PHPMYADMIN_PORT", "18080")
	t.Setenv("AGENT_PHPMYADMIN_RUNAS", "custom-user")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.PHPMYADMINPort != 18080 {
		t.Fatalf("PHPMYADMINPort = %d, want 18080", cfg.PHPMYADMINPort)
	}
	if cfg.PHPMYADMINRunAs != "custom-user" {
		t.Fatalf("PHPMYADMINRunAs = %q, want custom-user", cfg.PHPMYADMINRunAs)
	}
}
