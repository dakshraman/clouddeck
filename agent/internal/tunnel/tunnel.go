// Package tunnel manages Cloudflare Quick Tunnels (cloudflared) for exposed domains.
package tunnel

import (
	"bufio"
	"context"
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

// Tunnel represents an active cloudflared tunnel.
type Tunnel struct {
	Domain    string    `json:"domain"`
	PublicURL string    `json:"publicUrl"`
	StartedAt time.Time `json:"startedAt"`
	Status    string    `json:"status"` // "running"
	cmd       *exec.Cmd
}

// Service manages active cloudflared tunnel processes.
type Service struct {
	cfg        config.Config
	mu         sync.RWMutex
	tunnels    map[string]*Tunnel
	binaryPath string // optional override for testing
}

// New creates a new tunnel Service.
func New(cfg config.Config) *Service {
	return &Service{
		cfg:     cfg,
		tunnels: make(map[string]*Tunnel),
	}
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

	cmd := exec.Command(binPath, "tunnel", "--url", "http://127.0.0.1:80", "--http-host-header", domain)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start cloudflared: %w", err)
	}

	urlCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		scanner := bufio.NewScanner(stderr)
		found := false
		for scanner.Scan() {
			line := scanner.Text()
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
		}

		s.mu.Lock()
		if old, ok := s.tunnels[domain]; ok && old.cmd != nil && old.cmd.Process != nil {
			_ = old.cmd.Process.Kill()
			_ = old.cmd.Wait()
		}
		s.tunnels[domain] = tunnel
		s.mu.Unlock()

		go func() {
			_ = cmd.Wait()
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

	case <-time.After(15 * time.Second):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
		return nil, fmt.Errorf("timed out waiting for cloudflared tunnel URL")

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
	defer s.mu.Unlock()

	tunnel, ok := s.tunnels[domain]
	if !ok {
		return apierr.NotFound("tunnel_not_found", fmt.Sprintf("no active tunnel for domain %q", domain))
	}

	if tunnel.cmd != nil && tunnel.cmd.Process != nil {
		_ = tunnel.cmd.Process.Kill()
		_ = tunnel.cmd.Wait()
	}
	tunnel.Status = "stopped"
	delete(s.tunnels, domain)
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
