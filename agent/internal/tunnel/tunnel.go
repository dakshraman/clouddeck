// Package tunnel manages Cloudflare Quick Tunnels (cloudflared) for exposed domains.
package tunnel

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/config"
)

var tryCloudflareRe = regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)

// GlobalConfig represents the persistent Cloudflare Tunnel configuration.
type GlobalConfig struct {
	Token     string `json:"token"`
	AutoStart bool   `json:"autoStart"`
}

// GlobalStatus represents the status of the global Cloudflare Tunnel daemon.
type GlobalStatus struct {
	Configured bool       `json:"configured"`
	Status     string     `json:"status"` // "running", "stopped", "not_configured", "error"
	Running    bool       `json:"running"`
	Token      string     `json:"token,omitempty"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	Error      string     `json:"error,omitempty"`
}

// Tunnel represents an active cloudflared tunnel.
type Tunnel struct {
	Domain    string    `json:"domain"`
	PublicURL string    `json:"publicUrl"`
	StartedAt time.Time `json:"startedAt"`
	Status    string    `json:"status"` // "running"
	cmd       *exec.Cmd
	done      chan struct{}
}

// Service manages active cloudflared tunnel processes.
type Service struct {
	cfg        config.Config
	mu         sync.RWMutex
	tunnels    map[string]*Tunnel
	binaryPath string // optional override for testing

	// Global tunnel daemon
	globalCfg       GlobalConfig
	globalCmd       *exec.Cmd
	globalStartedAt *time.Time
	globalStatus    string
	globalErr       string
	globalDone      chan struct{}
}

// New creates a new tunnel Service.
func New(cfg config.Config) *Service {
	s := &Service{
		cfg:          cfg,
		tunnels:      make(map[string]*Tunnel),
		globalStatus: "not_configured",
	}
	_ = s.loadGlobalConfig()
	return s
}

func (s *Service) configPath() string {
	if s.cfg.StateDir != "" {
		_ = os.MkdirAll(s.cfg.StateDir, 0o755)
		return filepath.Join(s.cfg.StateDir, "tunnel.json")
	}
	return "tunnel.json"
}

func (s *Service) loadGlobalConfig() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p := s.configPath()
	data, err := os.ReadFile(p)
	if err != nil {
		s.globalStatus = "not_configured"
		return nil
	}
	var cfg GlobalConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		s.globalStatus = "not_configured"
		return err
	}
	s.globalCfg = cfg
	if strings.TrimSpace(cfg.Token) != "" {
		s.globalStatus = "stopped"
	} else {
		s.globalStatus = "not_configured"
	}
	return nil
}

func (s *Service) saveGlobalConfigLocked(cfg GlobalConfig) error {
	p := s.configPath()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o600)
}

// GetGlobalStatus returns the status of the global Cloudflare Tunnel daemon.
func (s *Service) GetGlobalStatus() GlobalStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	configured := strings.TrimSpace(s.globalCfg.Token) != ""
	running := s.globalStatus == "running" && (s.cfg.DryRun || (s.globalCmd != nil && s.globalCmd.Process != nil))

	st := s.globalStatus
	if !configured {
		st = "not_configured"
	} else if running {
		st = "running"
	} else if st == "running" && !running {
		st = "stopped"
	} else if st == "" {
		st = "stopped"
	}

	return GlobalStatus{
		Configured: configured,
		Status:     st,
		Running:    running,
		Token:      s.globalCfg.Token,
		StartedAt:  s.globalStartedAt,
		Error:      s.globalErr,
	}
}

// SaveGlobalConfig saves the Cloudflare Tunnel configuration.
func (s *Service) SaveGlobalConfig(cfg GlobalConfig) (GlobalStatus, error) {
	token := strings.TrimSpace(cfg.Token)
	if token == "" {
		return GlobalStatus{}, apierr.BadRequest("missing_token", "cloudflare tunnel token is required")
	}

	s.mu.Lock()
	s.globalCfg.Token = token
	s.globalCfg.AutoStart = cfg.AutoStart
	if s.globalStatus == "not_configured" || s.globalStatus == "" {
		s.globalStatus = "stopped"
	}
	err := s.saveGlobalConfigLocked(s.globalCfg)
	s.mu.Unlock()

	if err != nil {
		return GlobalStatus{}, fmt.Errorf("save tunnel config: %w", err)
	}

	return s.GetGlobalStatus(), nil
}

// StartGlobalTunnel starts the global Cloudflare Tunnel daemon using the configured token.
func (s *Service) StartGlobalTunnel(ctx context.Context) (GlobalStatus, error) {
	s.mu.Lock()
	token := strings.TrimSpace(s.globalCfg.Token)
	if token == "" {
		s.mu.Unlock()
		return GlobalStatus{}, apierr.BadRequest("tunnel_not_configured", "tunnel token is not configured")
	}

	if s.globalStatus == "running" && (s.cfg.DryRun || (s.globalCmd != nil && s.globalCmd.Process != nil)) {
		s.mu.Unlock()
		return s.GetGlobalStatus(), nil
	}

	if s.cfg.DryRun {
		now := time.Now().UTC()
		s.globalStartedAt = &now
		s.globalStatus = "running"
		s.globalErr = ""
		s.mu.Unlock()
		return s.GetGlobalStatus(), nil
	}

	binPath, err := s.resolveBinary()
	if err != nil {
		s.mu.Unlock()
		return GlobalStatus{}, err
	}

	cmd := exec.Command(binPath, "tunnel", "run", "--token", token)
	if err := cmd.Start(); err != nil {
		s.globalErr = err.Error()
		s.globalStatus = "error"
		s.mu.Unlock()
		return GlobalStatus{}, fmt.Errorf("start cloudflared tunnel daemon: %w", err)
	}

	now := time.Now().UTC()
	s.globalCmd = cmd
	s.globalStartedAt = &now
	s.globalStatus = "running"
	s.globalErr = ""
	s.globalDone = make(chan struct{})

	doneCh := s.globalDone
	s.mu.Unlock()

	go func() {
		err := cmd.Wait()
		close(doneCh)

		s.mu.Lock()
		if s.globalCmd == cmd {
			s.globalStatus = "stopped"
			s.globalCmd = nil
			if err != nil {
				s.globalErr = err.Error()
			}
		}
		s.mu.Unlock()
	}()

	return s.GetGlobalStatus(), nil
}

// StopGlobalTunnel stops the global Cloudflare Tunnel daemon.
func (s *Service) StopGlobalTunnel(ctx context.Context) (GlobalStatus, error) {
	s.mu.Lock()
	if s.globalStatus != "running" && s.globalCmd == nil {
		s.mu.Unlock()
		return s.GetGlobalStatus(), nil
	}

	s.globalStatus = "stopped"
	cmd := s.globalCmd
	doneCh := s.globalDone
	s.globalCmd = nil
	s.globalStartedAt = nil
	s.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
		if doneCh != nil {
			select {
			case <-doneCh:
			case <-time.After(2 * time.Second):
			}
		}
	}

	return s.GetGlobalStatus(), nil
}

// SetBinaryPath sets a custom path for the cloudflared binary (used in tests).
func (s *Service) SetBinaryPath(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.binaryPath = path
}

// StartTunnel starts a quick tunnel for the given domain using cloudflared.
func (s *Service) StartTunnel(ctx context.Context, domain string) (*Tunnel, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, apierr.BadRequest("invalid_domain", "domain is required")
	}

	s.mu.Lock()
	if existing, ok := s.tunnels[domain]; ok {
		if existing.Status == "running" && existing.cmd != nil && existing.cmd.Process != nil {
			s.mu.Unlock()
			return existing, nil
		}
	}
	s.mu.Unlock()

	if s.cfg.DryRun {
		s.mu.Lock()
		defer s.mu.Unlock()
		t := &Tunnel{
			Domain:    domain,
			PublicURL: fmt.Sprintf("https://%s.trycloudflare.com", strings.ReplaceAll(domain, ".", "-")),
			StartedAt: time.Now().UTC(),
			Status:    "running",
		}
		s.tunnels[domain] = t
		return t, nil
	}

	binPath, err := s.resolveBinary()
	if err != nil {
		return nil, err
	}

	cmd := exec.Command(binPath, "tunnel", "--url", "http://127.0.0.1:80", "--http-host-header", domain, "--no-autoupdate")
	pipeR, pipeW, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("create tunnel output pipe: %w", err)
	}
	cmd.Stdout = pipeW
	cmd.Stderr = pipeW

	if err := cmd.Start(); err != nil {
		pipeR.Close()
		pipeW.Close()
		return nil, fmt.Errorf("start cloudflared: %w", err)
	}
	// The child process inherited the write end; close it in parent so EOF triggers when child exits
	pipeW.Close()

	urlCh := make(chan string, 1)
	errCh := make(chan error, 1)
	var logLines []string
	var logMu sync.Mutex

	go func() {
		defer pipeR.Close()
		scanner := bufio.NewScanner(pipeR)
		found := false
		for scanner.Scan() {
			line := scanner.Text()
			logMu.Lock()
			if len(logLines) < 20 {
				logLines = append(logLines, line)
			}
			logMu.Unlock()

			if !found {
				if match := tryCloudflareRe.FindString(line); match != "" {
					found = true
					urlCh <- match
				}
			}
		}
		if err := scanner.Err(); err != nil {
			select {
			case errCh <- err:
			default:
			}
		}
	}()

	select {
	case publicURL := <-urlCh:
		tunnel := &Tunnel{
			Domain:    domain,
			PublicURL: publicURL,
			StartedAt: time.Now().UTC(),
			Status:    "running",
			cmd:       cmd,
			done:      make(chan struct{}),
		}

		s.mu.Lock()
		if old, ok := s.tunnels[domain]; ok && old.cmd != nil && old.cmd.Process != nil {
			_ = old.cmd.Process.Kill()
			if old.done != nil {
				s.mu.Unlock()
				select {
				case <-old.done:
				case <-time.After(2 * time.Second):
				}
				s.mu.Lock()
			}
		}
		s.tunnels[domain] = tunnel
		s.mu.Unlock()

		go func() {
			_ = cmd.Wait()
			close(tunnel.done)
			s.mu.Lock()
			if curr, ok := s.tunnels[domain]; ok && curr == tunnel {
				curr.Status = "stopped"
				delete(s.tunnels, domain)
			}
			s.mu.Unlock()
		}()

		return tunnel, nil

	case err := <-errCh:
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		return nil, fmt.Errorf("cloudflared error: %w", err)

	case <-time.After(45 * time.Second):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		logMu.Lock()
		tail := strings.Join(logLines, " | ")
		logMu.Unlock()
		return nil, fmt.Errorf("timed out waiting for cloudflared tunnel URL: %s", tail)

	case <-ctx.Done():
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		return nil, ctx.Err()
	}
}

// StopTunnel stops the running tunnel for the domain.
func (s *Service) StopTunnel(ctx context.Context, domain string) error {
	domain = strings.ToLower(strings.TrimSpace(domain))
	s.mu.Lock()
	tunnel, ok := s.tunnels[domain]
	if !ok {
		s.mu.Unlock()
		return apierr.NotFound("tunnel_not_found", fmt.Sprintf("no active tunnel for domain %q", domain))
	}

	tunnel.Status = "stopped"
	delete(s.tunnels, domain)
	s.mu.Unlock()

	if tunnel.cmd != nil && tunnel.cmd.Process != nil {
		_ = tunnel.cmd.Process.Kill()
		if tunnel.done != nil {
			select {
			case <-tunnel.done:
			case <-time.After(2 * time.Second):
			}
		}
	}
	return nil
}

// GetTunnel returns the active tunnel for the domain if one is running.
func (s *Service) GetTunnel(domain string) (*Tunnel, bool) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	s.mu.RLock()
	defer s.mu.RUnlock()

	tunnel, ok := s.tunnels[domain]
	if !ok || tunnel.Status != "running" {
		return nil, false
	}
	return tunnel, true
}

// ListTunnels returns all currently active tunnels sorted by domain name.
func (s *Service) ListTunnels() []*Tunnel {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make([]*Tunnel, 0, len(s.tunnels))
	for _, t := range s.tunnels {
		if t.Status == "running" {
			res = append(res, t)
		}
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].Domain < res[j].Domain
	})
	return res
}

// resolveBinary looks for cloudflared on the system or downloads it if missing.
func (s *Service) resolveBinary() (string, error) {
	s.mu.RLock()
	customPath := s.binaryPath
	s.mu.RUnlock()

	if customPath != "" {
		if _, err := os.Stat(customPath); err == nil {
			return customPath, nil
		}
	}

	// 1. Check PATH
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p, nil
	}

	// 2. Candidate paths
	candidates := []string{
		"/usr/local/bin/cloudflared",
		"/usr/bin/cloudflared",
	}
	home, err := os.UserHomeDir()
	if err == nil {
		candidates = append(candidates, filepath.Join(home, ".clouddeck", "bin", "cloudflared"))
	}

	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}

	// 3. Download if not found
	if home == "" {
		return "", fmt.Errorf("cloudflared not found and unable to determine home directory for installation")
	}
	dest := filepath.Join(home, ".clouddeck", "bin", "cloudflared")
	if err := downloadCloudflared(dest); err != nil {
		return "", fmt.Errorf("cloudflared binary not found and download failed: %w (please install cloudflared to PATH or %s)", err, dest)
	}
	return dest, nil
}

// downloadCloudflared downloads the official standalone cloudflared binary to dest.
func downloadCloudflared(dest string) error {
	arch := runtime.GOARCH
	var url string
	switch arch {
	case "amd64":
		url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
	case "arm64":
		url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
	case "arm":
		url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
	case "386":
		url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386"
	default:
		return fmt.Errorf("unsupported architecture for cloudflared: %s", arch)
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return fmt.Errorf("failed to create directory for cloudflared: %w", err)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download cloudflared: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download cloudflared: HTTP %d", resp.StatusCode)
	}

	tmpPath := dest + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return fmt.Errorf("failed to create file for cloudflared: %w", err)
	}

	_, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to write cloudflared binary: %w", copyErr)
	}
	if closeErr != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to close cloudflared file: %w", closeErr)
	}

	if err := os.Rename(tmpPath, dest); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("failed to install cloudflared to %s: %w", dest, err)
	}
	return nil
}
