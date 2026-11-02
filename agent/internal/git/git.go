package git

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/runas"
	"clouddeck/agent/internal/store"
)

// Service manages Git repositories and CI/CD deployments for sites.
type Service struct {
	st        *store.Store
	cfg       config.Config
	audit     *audit.Log
	restarter func(ctx context.Context, site string) error
	mu        sync.Mutex
	running   map[string]bool
	wg        sync.WaitGroup
}

// New creates the Git service.
func New(st *store.Store, cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{
		st:      st,
		cfg:     cfg,
		audit:   auditLog,
		running: make(map[string]bool),
	}
}

// SetRestarter registers an optional callback to restart site application processes after deployment.
func (s *Service) SetRestarter(fn func(ctx context.Context, site string) error) {
	s.restarter = fn
}

// SaveInput represents the parameters to configure Git on a site.
type SaveInput struct {
	RepoURL      string `json:"repoUrl"`
	Branch       string `json:"branch"`
	BuildCommand string `json:"buildCommand,omitempty"`
	AutoDeploy   bool   `json:"autoDeploy"`
}

// Get returns the Git configuration for a site. If no deploy key exists yet, one is created.
func (s *Service) Get(domain string) (store.GitConfig, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.GitConfig{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	pub, priv, err := s.ensureDeployKey(domain)
	if err != nil {
		return store.GitConfig{}, fmt.Errorf("ensure deploy key: %w", err)
	}

	if site.Git == nil {
		secret, _ := randomHex(24)
		return store.GitConfig{
			Branch:           "main",
			WebhookSecret:    secret,
			DeployKeyPublic:  pub,
			DeployKeyPrivate: priv,
			LastDeployStatus: "idle",
		}, nil
	}

	cfg := *site.Git
	if cfg.DeployKeyPublic == "" {
		cfg.DeployKeyPublic = pub
		cfg.DeployKeyPrivate = priv
	}
	return cfg, nil
}

// Save saves or updates Git and CI/CD settings for a site.
func (s *Service) Save(domain string, in SaveInput) (store.GitConfig, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.GitConfig{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	repoURL := strings.TrimSpace(in.RepoURL)
	if repoURL == "" {
		return store.GitConfig{}, apierr.BadRequest("missing_repo_url", "repository URL is required")
	}

	branch := strings.TrimSpace(in.Branch)
	if branch == "" {
		branch = "main"
	}

	pub, priv, err := s.ensureDeployKey(domain)
	if err != nil {
		return store.GitConfig{}, fmt.Errorf("ensure deploy key: %w", err)
	}

	var currentCfg store.GitConfig
	if site.Git != nil {
		currentCfg = *site.Git
	} else {
		secret, _ := randomHex(24)
		currentCfg = store.GitConfig{
			WebhookSecret: secret,
		}
	}

	currentCfg.RepoURL = repoURL
	currentCfg.Branch = branch
	currentCfg.BuildCommand = strings.TrimSpace(in.BuildCommand)
	currentCfg.AutoDeploy = in.AutoDeploy
	currentCfg.DeployKeyPublic = pub
	currentCfg.DeployKeyPrivate = priv
	if currentCfg.WebhookSecret == "" {
		currentCfg.WebhookSecret, _ = randomHex(24)
	}

	if err := s.st.UpdateSite(domain, func(stSite *store.Site) {
		stSite.Git = &currentCfg
	}); err != nil {
		return store.GitConfig{}, fmt.Errorf("save git config: %w", err)
	}

	return currentCfg, nil
}

// Remove disconnects Git configuration from the site.
func (s *Service) Remove(domain string) error {
	_, ok := s.st.GetSite(domain)
	if !ok {
		return apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	return s.st.UpdateSite(domain, func(stSite *store.Site) {
		stSite.Git = nil
	})
}

// Deploy triggers an asynchronous or synchronous deployment for a site.
func (s *Service) Deploy(ctx context.Context, domain string, trigger string) (store.DeployRecord, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.DeployRecord{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}
	if site.Git == nil || site.Git.RepoURL == "" {
		return store.DeployRecord{}, apierr.BadRequest("git_not_configured", "git repository is not configured for this site")
	}

	s.mu.Lock()
	if s.running[domain] {
		s.mu.Unlock()
		return store.DeployRecord{}, apierr.Conflict("deploy_in_progress", "a deployment is already in progress for this site")
	}
	s.running[domain] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.running, domain)
		s.mu.Unlock()
	}()

	gitCfg := *site.Git
	startedAt := time.Now()
	deployID, _ := randomHex(8)

	record := store.DeployRecord{
		ID:        deployID,
		Trigger:   trigger,
		Status:    "running",
		StartedAt: startedAt,
	}

	// Update status to deploying
	_ = s.st.UpdateSite(domain, func(stSite *store.Site) {
		if stSite.Git != nil {
			stSite.Git.LastDeployStatus = "deploying"
		}
	})

	var logBuf bytes.Buffer
	logLine := func(msg string) {
		timestamp := time.Now().UTC().Format("15:04:05")
		logBuf.WriteString(fmt.Sprintf("[%s] %s\n", timestamp, msg))
	}

	logLine(fmt.Sprintf("Starting %s deployment for %s (branch: %s)", trigger, gitCfg.RepoURL, gitCfg.Branch))

	// Ensure site root exists
	if err := os.MkdirAll(site.Root, 0o755); err != nil {
		record.Status = "failed"
		record.FinishedAt = time.Now()
		record.DurationMs = time.Since(startedAt).Milliseconds()
		logLine(fmt.Sprintf("Failed to create webroot: %v", err))
		record.Logs = logBuf.String()
		s.recordDeploy(domain, record)
		return record, fmt.Errorf("create webroot: %w", err)
	}

	keyFile := gitCfg.DeployKeyPrivate
	sshCmd := fmt.Sprintf("ssh -i %s -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null", keyFile)
	env := os.Environ()
	env = append(env, "GIT_SSH_COMMAND="+sshCmd)
	env = append(env, "GIT_TERMINAL_PROMPT=0")

	// Prepend standard binary paths to PATH for build commands
	extraPaths := "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	if home := os.Getenv("HOME"); home != "" {
		extraPaths = fmt.Sprintf("%s:%s/.nvm/versions/node/$(ls %s/.nvm/versions/node 2>/dev/null | tail -n 1)/bin", extraPaths, home, home)
	}
	env = append(env, "PATH="+extraPaths+":"+os.Getenv("PATH"))

	dotGit := filepath.Join(site.Root, ".git")
	isCloned := false
	if fi, err := os.Stat(dotGit); err == nil && fi.IsDir() {
		isCloned = true
	}

	var execErr error
	if !isCloned {
		logLine("Cloning repository into webroot…")
		// Clean placeholder index.html if empty or stock
		idxPath := filepath.Join(site.Root, "index.html")
		if _, err := os.Stat(idxPath); err == nil {
			_ = os.Remove(idxPath)
		}

		// If webroot has files, use git init + remote + fetch + reset to avoid non-empty dir clone failure
		entries, _ := os.ReadDir(site.Root)
		if len(entries) > 0 {
			logLine("Initializing git repository in existing directory…")
			commands := [][]string{
				{"git", "init"},
				{"git", "remote", "add", "origin", gitCfg.RepoURL},
				{"git", "fetch", "--depth=50", "origin", gitCfg.Branch},
				{"git", "checkout", "-f", "-B", gitCfg.Branch, "origin/" + gitCfg.Branch},
			}
			for _, args := range commands {
				cmd := exec.CommandContext(ctx, args[0], args[1:]...)
				cmd.Dir = site.Root
				cmd.Env = env
				out, err := cmd.CombinedOutput()
				logBuf.Write(out)
				if err != nil {
					execErr = fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
					break
				}
			}
		} else {
			cmd := exec.CommandContext(ctx, "git", "clone", "--branch", gitCfg.Branch, "--depth=50", gitCfg.RepoURL, site.Root)
			cmd.Env = env
			out, err := cmd.CombinedOutput()
			logBuf.Write(out)
			if err != nil {
				execErr = fmt.Errorf("git clone: %w", err)
			}
		}
	} else {
		logLine("Fetching latest commits from remote…")
		commands := [][]string{
			{"git", "remote", "set-url", "origin", gitCfg.RepoURL},
			{"git", "fetch", "--depth=50", "origin", gitCfg.Branch},
			{"git", "checkout", gitCfg.Branch},
			{"git", "reset", "--hard", "origin/" + gitCfg.Branch},
		}
		for _, args := range commands {
			cmd := exec.CommandContext(ctx, args[0], args[1:]...)
			cmd.Dir = site.Root
			cmd.Env = env
			out, err := cmd.CombinedOutput()
			logBuf.Write(out)
			if err != nil {
				execErr = fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
				break
			}
		}
	}

	if execErr != nil {
		logLine(fmt.Sprintf("Git operation failed: %v", execErr))
		record.Status = "failed"
		record.FinishedAt = time.Now()
		record.DurationMs = time.Since(startedAt).Milliseconds()
		record.Logs = logBuf.String()
		s.recordDeploy(domain, record)
		return record, execErr
	}

	// Read commit info: Hash, Author, Subject, Date
	commitCmd := exec.CommandContext(ctx, "git", "log", "-1", "--format=%H%n%an%n%s%n%cI")
	commitCmd.Dir = site.Root
	commitCmd.Env = env
	if commitOut, err := commitCmd.Output(); err == nil {
		lines := strings.Split(strings.TrimSpace(string(commitOut)), "\n")
		if len(lines) >= 4 {
			record.CommitHash = lines[0]
			record.Author = lines[1]
			record.CommitMsg = lines[2]
			gitCfg.LastCommitHash = lines[0]
			gitCfg.LastCommitAuthor = lines[1]
			gitCfg.LastCommitMsg = lines[2]
			gitCfg.LastCommitTime = lines[3]
			logLine(fmt.Sprintf("Checked out commit %s by %s: %q", lines[0][:8], lines[1], lines[2]))
		}
	}

	// Run optional Build Command
	if gitCfg.BuildCommand != "" {
		logLine(fmt.Sprintf("Running build command: %s", gitCfg.BuildCommand))
		buildCmd := exec.CommandContext(ctx, "sh", "-c", gitCfg.BuildCommand)
		buildCmd.Dir = site.Root
		buildCmd.Env = env
		out, err := buildCmd.CombinedOutput()
		logBuf.Write(out)
		if err != nil {
			logLine(fmt.Sprintf("Build command failed: %v", err))
			record.Status = "failed"
			record.FinishedAt = time.Now()
			record.DurationMs = time.Since(startedAt).Milliseconds()
			record.Logs = logBuf.String()
			s.recordDeploy(domain, record)
			return record, fmt.Errorf("build command: %w", err)
		}
		logLine("Build command completed successfully.")
	}

	// Apply directory permissions
	uid, gid, _ := s.resolveRunAs()
	if uid >= 0 && gid >= 0 {
		_ = filepath.Walk(site.Root, func(p string, info os.FileInfo, err error) error {
			if err == nil {
				_ = os.Chown(p, uid, gid)
			}
			return nil
		})
	}

	// Restart supervised background processes if registered
	if s.restarter != nil {
		logLine("Reloading supervised application processes…")
		if err := s.restarter(ctx, domain); err != nil {
			logLine(fmt.Sprintf("Notice during process reload: %v", err))
		} else {
			logLine("Application processes reloaded.")
		}
	}

	record.Status = "succeeded"
	record.FinishedAt = time.Now()
	record.DurationMs = time.Since(startedAt).Milliseconds()
	logLine(fmt.Sprintf("Deployment succeeded in %dms.", record.DurationMs))
	record.Logs = logBuf.String()

	gitCfg.LastDeployAt = time.Now().UTC().Format(time.RFC3339)
	gitCfg.LastDeployStatus = "succeeded"

	// Save record and update state
	s.recordDeployWithConfig(domain, record, gitCfg)
	return record, nil
}

// recordDeploy updates deployment record in site store.
func (s *Service) recordDeploy(domain string, record store.DeployRecord) {
	_ = s.st.UpdateSite(domain, func(site *store.Site) {
		if site.Git != nil {
			site.Git.LastDeployStatus = record.Status
			site.Git.LastDeployAt = time.Now().UTC().Format(time.RFC3339)
			history := append([]store.DeployRecord{record}, site.Git.History...)
			if len(history) > 20 {
				history = history[:20]
			}
			site.Git.History = history
		}
	})
}

func (s *Service) recordDeployWithConfig(domain string, record store.DeployRecord, cfg store.GitConfig) {
	_ = s.st.UpdateSite(domain, func(site *store.Site) {
		history := append([]store.DeployRecord{record}, cfg.History...)
		if len(history) > 20 {
			history = history[:20]
		}
		cfg.History = history
		site.Git = &cfg
	})
}

// Wait blocks until any in-flight background deployments finish.
func (s *Service) Wait() {
	s.wg.Wait()
}

// HandleWebhook verifies and processes webhook payloads from GitHub, GitLab, or generic hooks.
func (s *Service) HandleWebhook(domain string, headers http.Header, queryToken string, body []byte) (store.DeployRecord, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return store.DeployRecord{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}
	if site.Git == nil || !site.Git.AutoDeploy {
		return store.DeployRecord{}, apierr.BadRequest("auto_deploy_disabled", "auto-deploy is disabled for this site")
	}

	secret := site.Git.WebhookSecret

	// Signature verification:
	// 1. GitHub: X-Hub-Signature-256
	// 2. GitLab: X-Gitlab-Token
	// 3. Generic query param or X-CloudDeck-Token
	authed := false
	ghSig := headers.Get("X-Hub-Signature-256")
	glToken := headers.Get("X-Gitlab-Token")
	customToken := headers.Get("X-CloudDeck-Token")

	if ghSig != "" && strings.HasPrefix(ghSig, "sha256=") {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
		if hmac.Equal([]byte(ghSig), []byte(expected)) {
			authed = true
		}
	} else if glToken != "" && glToken == secret {
		authed = true
	} else if customToken != "" && customToken == secret {
		authed = true
	} else if queryToken != "" && queryToken == secret {
		authed = true
	}

	if !authed {
		return store.DeployRecord{}, apierr.New(http.StatusUnauthorized, "invalid_signature", "webhook signature verification failed")
	}

	// Verify push event and branch if payload is JSON
	if len(body) > 0 {
		var payload struct {
			Ref string `json:"ref"`
		}
		if err := json.Unmarshal(body, &payload); err == nil && payload.Ref != "" {
			expectedRef := "refs/heads/" + site.Git.Branch
			if payload.Ref != expectedRef {
				// Event is for another branch; skip deploy cleanly
				return store.DeployRecord{
					Status: "skipped",
					Logs:   fmt.Sprintf("Skipped: push event was for ref %q, configured branch is %q", payload.Ref, site.Git.Branch),
				}, nil
			}
		}
	}

	// Trigger deploy in background
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		_, _ = s.Deploy(ctx, domain, "webhook")
	}()

	return store.DeployRecord{
		Status: "deploying",
		Logs:   "Webhook received successfully. Deployment queued in background.",
	}, nil
}

// ensureDeployKey generates or retrieves an Ed25519 SSH keypair specifically for this site.
func (s *Service) ensureDeployKey(domain string) (pub string, privPath string, err error) {
	keyDir := filepath.Join(s.cfg.StateDir, "deploy_keys")
	if err := os.MkdirAll(keyDir, 0o700); err != nil {
		return "", "", fmt.Errorf("create deploy key dir: %w", err)
	}

	cleanDomain := strings.ReplaceAll(domain, "/", "_")
	privPath = filepath.Join(keyDir, cleanDomain)
	pubPath := privPath + ".pub"

	if _, err := os.Stat(privPath); err == nil {
		pubBytes, err := os.ReadFile(pubPath)
		if err == nil && len(pubBytes) > 0 {
			return strings.TrimSpace(string(pubBytes)), privPath, nil
		}
	}

	// Generate key using ssh-keygen
	cmd := exec.Command("ssh-keygen", "-t", "ed25519", "-N", "", "-f", privPath, "-C", "clouddeck-deploy@"+domain)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", "", fmt.Errorf("ssh-keygen: %w: %s", err, string(out))
	}

	_ = os.Chmod(privPath, 0o600)
	pubBytes, err := os.ReadFile(pubPath)
	if err != nil {
		return "", "", fmt.Errorf("read generated public key: %w", err)
	}

	return strings.TrimSpace(string(pubBytes)), privPath, nil
}

func (s *Service) resolveRunAs() (int, int, error) {
	if s.cfg.WebRunAs == "" {
		return -1, -1, nil
	}
	u, g, err := runas.Lookup(s.cfg.WebRunAs)
	if err != nil {
		return -1, -1, err
	}
	return u, g, nil
}

func randomHex(bytesLen int) (string, error) {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
