package mail

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

func newTestMailHarness(t *testing.T) *Service {
	t.Helper()
	dir := t.TempDir()
	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir:     dir,
		MailRoot:     filepath.Join(dir, "mail"),
		MailHostname: "mail.example.com",
		DryRun:       true,
	}
	return New(cfg, auditLog, nil)
}

func TestWebmailAndSpamLifecycle(t *testing.T) {
	svc := newTestMailHarness(t)
	ctx := context.Background()

	// 1. Webmail Status
	wmStatus := svc.WebmailStatus()
	if !wmStatus.Installed || !wmStatus.Running {
		t.Fatalf("expected webmail installed and running: %+v", wmStatus)
	}
	if !strings.Contains(wmStatus.URL, "mail.example.com") {
		t.Fatalf("expected URL to use configured mail hostname, got %s", wmStatus.URL)
	}

	// 2. Install Webmail
	if err := svc.InstallWebmail(ctx); err != nil {
		t.Fatalf("InstallWebmail: %v", err)
	}

	// 3. Webmail SSO
	sso, err := svc.GenerateWebmailSSO(ctx, "user@example.com")
	if err != nil {
		t.Fatalf("GenerateWebmailSSO: %v", err)
	}
	if !sso.Success || sso.Token == "" {
		t.Fatalf("expected SSO success with token, got %+v", sso)
	}
	if !strings.Contains(sso.RedirectURL, "sso_token=") {
		t.Fatalf("expected redirect URL with sso_token, got %s", sso.RedirectURL)
	}

	// 4. Invalid email SSO
	_, err = svc.GenerateWebmailSSO(ctx, "not-an-email")
	if err == nil {
		t.Fatalf("expected error on invalid email")
	}

	// 5. Spam Status
	spStatus := svc.SpamStatus()
	if !spStatus.Installed || !spStatus.Running {
		t.Fatalf("expected spam engine installed and running: %+v", spStatus)
	}
	if spStatus.Config.RejectScore != 15.0 {
		t.Fatalf("expected default reject score 15.0, got %f", spStatus.Config.RejectScore)
	}

	// 6. Update Spam Config
	err = svc.UpdateSpamConfig(ctx, SpamConfig{
		Enabled:          true,
		RejectScore:      12.5,
		TagScore:         4.0,
		Greylisting:      false,
		WhitelistDomains: []string{"trusted.com"},
		BlacklistDomains: []string{"spammer.com"},
	})
	if err != nil {
		t.Fatalf("UpdateSpamConfig: %v", err)
	}

	// Verify updated
	spStatus2 := svc.SpamStatus()
	if spStatus2.Config.RejectScore != 12.5 || spStatus2.Config.TagScore != 4.0 {
		t.Fatalf("unexpected updated spam config: %+v", spStatus2.Config)
	}
	if spStatus2.Config.Greylisting {
		t.Fatalf("expected greylisting=false")
	}
	if len(spStatus2.Config.WhitelistDomains) != 1 || spStatus2.Config.WhitelistDomains[0] != "trusted.com" {
		t.Fatalf("unexpected whitelist domains: %v", spStatus2.Config.WhitelistDomains)
	}
}
