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

func TestLoadPanelSSLDefaults(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.PanelEnvFile != "/etc/clouddeck/panel.env" {
		t.Errorf("PanelEnvFile = %q, want /etc/clouddeck/panel.env", cfg.PanelEnvFile)
	}
	if cfg.PanelSSLDir != "/etc/clouddeck/ssl" {
		t.Errorf("PanelSSLDir = %q, want /etc/clouddeck/ssl", cfg.PanelSSLDir)
	}
	wantNginxConf := "/etc/nginx/conf.d/clouddeck-panel.conf"
	if cfg.PanelNginxConf != wantNginxConf {
		t.Errorf("PanelNginxConf = %q, want %q", cfg.PanelNginxConf, wantNginxConf)
	}
	if cfg.PanelRestartCmd != "systemctl restart clouddeck-panel" {
		t.Errorf("PanelRestartCmd = %q, want systemctl restart clouddeck-panel", cfg.PanelRestartCmd)
	}
	if cfg.PanelPort != 2083 {
		t.Errorf("PanelPort = %d, want 2083", cfg.PanelPort)
	}
	if cfg.PanelInternalPort != 2082 {
		t.Errorf("PanelInternalPort = %d, want 2082", cfg.PanelInternalPort)
	}
}

func TestLoadPanelSSLCustom(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")
	t.Setenv("AGENT_PANEL_ENV_FILE", "/custom/panel.env")
	t.Setenv("AGENT_PANEL_SSL_DIR", "/custom/ssl")
	t.Setenv("AGENT_PANEL_NGINX_CONF", "/custom/nginx/panel.conf")
	t.Setenv("AGENT_PANEL_RESTART_CMD", "custom-restart-panel")
	t.Setenv("AGENT_PANEL_PORT", "8443")
	t.Setenv("AGENT_PANEL_INTERNAL_PORT", "8442")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.PanelEnvFile != "/custom/panel.env" {
		t.Errorf("PanelEnvFile = %q, want /custom/panel.env", cfg.PanelEnvFile)
	}
	if cfg.PanelSSLDir != "/custom/ssl" {
		t.Errorf("PanelSSLDir = %q, want /custom/ssl", cfg.PanelSSLDir)
	}
	if cfg.PanelNginxConf != "/custom/nginx/panel.conf" {
		t.Errorf("PanelNginxConf = %q, want /custom/nginx/panel.conf", cfg.PanelNginxConf)
	}
	if cfg.PanelRestartCmd != "custom-restart-panel" {
		t.Errorf("PanelRestartCmd = %q, want custom-restart-panel", cfg.PanelRestartCmd)
	}
	if cfg.PanelPort != 8443 {
		t.Errorf("PanelPort = %d, want 8443", cfg.PanelPort)
	}
	if cfg.PanelInternalPort != 8442 {
		t.Errorf("PanelInternalPort = %d, want 8442", cfg.PanelInternalPort)
	}
}

func TestLoadRejectsInvalidPanelPorts(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")

	t.Run("invalid panel port", func(t *testing.T) {
		t.Setenv("AGENT_PANEL_PORT", "invalid")
		_, err := Load()
		if err == nil || !strings.Contains(err.Error(), "AGENT_PANEL_PORT") {
			t.Fatalf("expected AGENT_PANEL_PORT error, got %v", err)
		}
	})

	t.Run("invalid panel internal port", func(t *testing.T) {
		t.Setenv("AGENT_PANEL_PORT", "2083")
		t.Setenv("AGENT_PANEL_INTERNAL_PORT", "70000")
		_, err := Load()
		if err == nil || !strings.Contains(err.Error(), "AGENT_PANEL_INTERNAL_PORT") {
			t.Fatalf("expected AGENT_PANEL_INTERNAL_PORT error, got %v", err)
		}
	})
}

func TestLoadNameserversAndServerIP(t *testing.T) {
	t.Setenv("AGENT_AUTH_TOKEN", "test-token")

	t.Run("defaults", func(t *testing.T) {
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() error = %v", err)
		}
		if !strings.HasPrefix(cfg.Nameserver1, "ns1.") {
			t.Errorf("Nameserver1 = %q, want prefix ns1.", cfg.Nameserver1)
		}
		if !strings.HasPrefix(cfg.Nameserver2, "ns2.") {
			t.Errorf("Nameserver2 = %q, want prefix ns2.", cfg.Nameserver2)
		}
		if cfg.ServerIP == "" {
			t.Error("ServerIP is empty")
		}
	})

	t.Run("explicit custom values", func(t *testing.T) {
		t.Setenv("AGENT_NAMESERVER1", "ns1.custom.com")
		t.Setenv("AGENT_NAMESERVER2", "ns2.custom.com")
		t.Setenv("AGENT_SERVER_IP", "198.51.100.1")

		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load() error = %v", err)
		}
		if cfg.Nameserver1 != "ns1.custom.com" {
			t.Errorf("Nameserver1 = %q, want ns1.custom.com", cfg.Nameserver1)
		}
		if cfg.Nameserver2 != "ns2.custom.com" {
			t.Errorf("Nameserver2 = %q, want ns2.custom.com", cfg.Nameserver2)
		}
		if cfg.ServerIP != "198.51.100.1" {
			t.Errorf("ServerIP = %q, want 198.51.100.1", cfg.ServerIP)
		}
	})
}
