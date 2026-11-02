package git

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func newTestService(t *testing.T) (*Service, *store.Store) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}

	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		StateDir: dir,
		Webroot:  filepath.Join(dir, "www"),
	}

	site := store.Site{
		Domain: "testsite.com",
		Root:   filepath.Join(dir, "www", "testsite.com"),
	}
	if err := st.CreateSite(site); err != nil {
		t.Fatalf("CreateSite: %v", err)
	}

	svc := New(st, cfg, auditLog)
	return svc, st
}

func TestGitGetAndSave(t *testing.T) {
	svc, _ := newTestService(t)

	// Initial Get auto-generates deploy key
	cfg, err := svc.Get("testsite.com")
	if err != nil {
		t.Fatalf("svc.Get: %v", err)
	}
	if cfg.DeployKeyPublic == "" {
		t.Errorf("expected generated public deploy key, got empty")
	}

	// Save Git config
	saved, err := svc.Save("testsite.com", SaveInput{
		RepoURL:      "https://github.com/example/repo.git",
		Branch:       "main",
		BuildCommand: "npm run build",
		AutoDeploy:   true,
	})
	if err != nil {
		t.Fatalf("svc.Save: %v", err)
	}
	if saved.RepoURL != "https://github.com/example/repo.git" {
		t.Errorf("unexpected RepoURL: %s", saved.RepoURL)
	}
	if saved.WebhookSecret == "" {
		t.Errorf("expected generated webhook secret")
	}

	// Verify persistence
	cfg2, err := svc.Get("testsite.com")
	if err != nil {
		t.Fatalf("svc.Get after save: %v", err)
	}
	if cfg2.RepoURL != saved.RepoURL {
		t.Errorf("got %s, want %s", cfg2.RepoURL, saved.RepoURL)
	}

	// Remove Git config
	if err := svc.Remove("testsite.com"); err != nil {
		t.Fatalf("svc.Remove: %v", err)
	}

	cfg3, err := svc.Get("testsite.com")
	if err != nil {
		t.Fatalf("svc.Get after remove: %v", err)
	}
	if cfg3.RepoURL != "" {
		t.Errorf("expected empty repo URL after remove, got %s", cfg3.RepoURL)
	}
}

func TestWebhookVerification(t *testing.T) {
	svc, _ := newTestService(t)

	saved, err := svc.Save("testsite.com", SaveInput{
		RepoURL:    "https://github.com/example/repo.git",
		Branch:     "main",
		AutoDeploy: true,
	})
	if err != nil {
		t.Fatalf("svc.Save: %v", err)
	}

	body := []byte(`{"ref":"refs/heads/main"}`)

	// Compute GitHub HMAC SHA256
	mac := hmac.New(sha256.New, []byte(saved.WebhookSecret))
	mac.Write(body)
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	headers := http.Header{}
	headers.Set("X-Hub-Signature-256", sig)

	// Valid GitHub signature
	res, err := svc.HandleWebhook("testsite.com", headers, "", body)
	if err != nil {
		t.Fatalf("HandleWebhook with valid signature failed: %v", err)
	}
	if res.Status != "deploying" {
		t.Errorf("expected status 'deploying', got %s", res.Status)
	}

	// Invalid signature
	headers.Set("X-Hub-Signature-256", "sha256=invalid")
	_, err = svc.HandleWebhook("testsite.com", headers, "", body)
	if err == nil {
		t.Errorf("expected error with invalid signature")
	}

	// Valid GitLab token
	headers = http.Header{}
	headers.Set("X-Gitlab-Token", saved.WebhookSecret)
	res2, err := svc.HandleWebhook("testsite.com", headers, "", body)
	if err != nil {
		t.Fatalf("HandleWebhook with GitLab token failed: %v", err)
	}
	if res2.Status != "deploying" {
		t.Errorf("expected status 'deploying', got %s", res2.Status)
	}

	// Non-matching branch should skip cleanly
	otherBranchBody := []byte(`{"ref":"refs/heads/feature-xyz"}`)
	headers.Set("X-Gitlab-Token", saved.WebhookSecret)
	res3, err := svc.HandleWebhook("testsite.com", headers, "", otherBranchBody)
	if err != nil {
		t.Fatalf("HandleWebhook with other branch failed: %v", err)
	}
	if res3.Status != "skipped" {
		t.Errorf("expected status 'skipped', got %s", res3.Status)
	}

	svc.Wait()
}

func TestLocalGitCloneAndDeploy(t *testing.T) {
	svc, st := newTestService(t)
	dir := t.TempDir()

	// Create a local dummy git repo to test clone and build
	remoteRepoDir := filepath.Join(dir, "remote_repo")
	if err := os.MkdirAll(remoteRepoDir, 0o755); err != nil {
		t.Fatal(err)
	}

	initCmd := exec.Command("git", "init")
	initCmd.Dir = remoteRepoDir
	if out, err := initCmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, out)
	}

	// Configure git author
	_ = exec.Command("git", "-C", remoteRepoDir, "config", "user.name", "Test User").Run()
	_ = exec.Command("git", "-C", remoteRepoDir, "config", "user.email", "test@example.com").Run()

	file1 := filepath.Join(remoteRepoDir, "app.js")
	if err := os.WriteFile(file1, []byte("console.log('v1');"), 0o644); err != nil {
		t.Fatal(err)
	}

	_ = exec.Command("git", "-C", remoteRepoDir, "add", ".").Run()
	_ = exec.Command("git", "-C", remoteRepoDir, "commit", "-m", "Initial commit").Run()
	_ = exec.Command("git", "-C", remoteRepoDir, "branch", "-M", "main").Run()

	site, _ := st.GetSite("testsite.com")
	siteRoot := site.Root

	_, err := svc.Save("testsite.com", SaveInput{
		RepoURL:      remoteRepoDir,
		Branch:       "main",
		BuildCommand: "echo 'build-step-ran' > build.txt",
		AutoDeploy:   true,
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}

	record, err := svc.Deploy(context.Background(), "testsite.com", "manual")
	if err != nil {
		t.Fatalf("Deploy: %v, logs: %s", err, record.Logs)
	}
	if record.Status != "succeeded" {
		t.Errorf("expected record status succeeded, got %s", record.Status)
	}

	// Check that app.js was cloned
	if _, err := os.Stat(filepath.Join(siteRoot, "app.js")); err != nil {
		t.Errorf("app.js was not cloned to site root: %v", err)
	}

	// Check that build command was executed
	buildTxt, err := os.ReadFile(filepath.Join(siteRoot, "build.txt"))
	if err != nil || !strings.Contains(string(buildTxt), "build-step-ran") {
		t.Errorf("build.txt missing or wrong content: %v", err)
	}
}
