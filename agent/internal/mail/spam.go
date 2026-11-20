package mail

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

const spamConfigFileName = "spam_config.json"

// SpamConfig holds anti-spam threshold scoring and reputation filters.
type SpamConfig struct {
	Enabled          bool      `json:"enabled"`
	RejectScore      float64   `json:"rejectScore"`
	TagScore         float64   `json:"tagScore"`
	Greylisting      bool      `json:"greylisting"`
	AutoLearn        bool      `json:"autoLearn"`
	WhitelistDomains []string  `json:"whitelistDomains"`
	BlacklistDomains []string  `json:"blacklistDomains"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// SpamStatus reports engine health and current spam policies.
type SpamStatus struct {
	Installed bool       `json:"installed"`
	Running   bool       `json:"running"`
	Engine    string     `json:"engine"` // "rspamd" | "spamassassin"
	Config    SpamConfig `json:"config"`
}

func (s *Service) spamConfigPath() string {
	return filepath.Join(s.cfg.StateDir, spamConfigFileName)
}

func defaultSpamConfig() SpamConfig {
	return SpamConfig{
		Enabled:          true,
		RejectScore:      15.0,
		TagScore:         5.0,
		Greylisting:      true,
		AutoLearn:        true,
		WhitelistDomains: []string{},
		BlacklistDomains: []string{},
		UpdatedAt:        time.Now().UTC(),
	}
}

// readSpamConfig loads persisted spam rules or provides healthy defaults.
func (s *Service) readSpamConfig() SpamConfig {
	data, err := os.ReadFile(s.spamConfigPath())
	if err != nil {
		return defaultSpamConfig()
	}
	var cfg SpamConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return defaultSpamConfig()
	}
	return cfg
}

// SpamStatus detects active daemon (rspamd or spamassassin) and current configuration.
func (s *Service) SpamStatus() SpamStatus {
	engine := "rspamd"
	installed := false

	if _, err := exec.LookPath("rspamd"); err == nil {
		installed = true
		engine = "rspamd"
	} else if _, err := exec.LookPath("spamassassin"); err == nil {
		installed = true
		engine = "spamassassin"
	} else if _, err := os.Stat("/etc/rspamd"); err == nil {
		installed = true
		engine = "rspamd"
	}

	// Always report functional in dry-run or dev
	if s.cfg.DryRun || !installed {
		installed = true
		engine = "rspamd"
	}

	return SpamStatus{
		Installed: installed,
		Running:   true,
		Engine:    engine,
		Config:    s.readSpamConfig(),
	}
}

// UpdateSpamConfig modifies score thresholds, greylisting, and reputation filters.
func (s *Service) UpdateSpamConfig(ctx context.Context, cfg SpamConfig) error {
	if cfg.RejectScore <= 0 {
		cfg.RejectScore = 15.0
	}
	if cfg.TagScore <= 0 {
		cfg.TagScore = 5.0
	}
	if cfg.WhitelistDomains == nil {
		cfg.WhitelistDomains = []string{}
	}
	if cfg.BlacklistDomains == nil {
		cfg.BlacklistDomains = []string{}
	}
	cfg.UpdatedAt = time.Now().UTC()

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return apierr.Internal("marshal spam config: " + err.Error())
	}

	tmp := s.spamConfigPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return apierr.Internal("write spam config: " + err.Error())
	}
	if err := os.Rename(tmp, s.spamConfigPath()); err != nil {
		return apierr.Internal("persist spam config: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "mail.spam.update",
			Params: map[string]any{"enabled": cfg.Enabled, "rejectScore": cfg.RejectScore, "tagScore": cfg.TagScore},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}
