package ssl

import (
	"context"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func TestWildcardSSL(t *testing.T) {
	tmpDir := t.TempDir()
	st, err := store.Open(filepath.Join(tmpDir, "store.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	domain := "example.com"
	err = st.CreateSite(store.Site{Domain: domain, Root: filepath.Join(tmpDir, "example.com"), PHPVersion: "8.2"})
	if err != nil {
		t.Fatalf("create site: %v", err)
	}

	cfg := config.Config{StateDir: tmpDir, DryRun: true}
	issuer := New(st, nil, nil, nil, cfg)

	// List providers
	providers := issuer.ListDNSProviders()
	if len(providers) < 4 {
		t.Fatalf("expected at least 4 DNS providers, got %d", len(providers))
	}

	foundCF := false
	for _, p := range providers {
		if p.ID == "cloudflare" {
			foundCF = true
			break
		}
	}
	if !foundCF {
		t.Errorf("cloudflare provider not found in ListDNSProviders")
	}

	// Invalid email
	_, err = issuer.IssueWildcard(context.Background(), domain, WildcardRequest{
		Email:    "bademail",
		Provider: "cloudflare",
	})
	if err == nil {
		t.Errorf("expected error for invalid email")
	}

	// Unsupported provider
	_, err = issuer.IssueWildcard(context.Background(), domain, WildcardRequest{
		Email:    "admin@example.com",
		Provider: "nonexistent",
	})
	if err == nil {
		t.Errorf("expected error for nonexistent provider")
	}

	// Successful dry-run issue
	res, err := issuer.IssueWildcard(context.Background(), domain, WildcardRequest{
		Email:    "admin@example.com",
		Provider: "cloudflare",
		Credentials: map[string]string{
			"api_token": "cf_test_token_123",
		},
	})
	if err != nil {
		t.Fatalf("IssueWildcard failed: %v", err)
	}

	if !res.Success {
		t.Errorf("expected success true")
	}
	if res.Wildcard != "*.example.com" {
		t.Errorf("expected wildcard *.example.com, got %s", res.Wildcard)
	}

	// Check store updated
	site, ok := st.GetSite(domain)
	if !ok || !site.SSL.Enabled {
		t.Errorf("expected site SSL to be enabled in store")
	}
}
