package caching

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// RedisStatus reports daemon and memory metrics for Redis / Valkey.
type RedisStatus struct {
	Installed        bool   `json:"installed"`
	Running          bool   `json:"running"`
	DaemonName       string `json:"daemonName"`
	Version          string `json:"version,omitempty"`
	SocketPath       string `json:"socketPath,omitempty"`
	Port             int    `json:"port,omitempty"`
	UsedMemory       string `json:"usedMemory,omitempty"`
	PeakMemory       string `json:"peakMemory,omitempty"`
	MaxMemory        string `json:"maxMemory,omitempty"`
	TotalKeys        int64  `json:"totalKeys"`
	ConnectedClients int    `json:"connectedClients"`
	UptimeDays       int    `json:"uptimeDays"`
}

// MemcachedStatus reports availability of the Memcached daemon.
type MemcachedStatus struct {
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Port      int    `json:"port,omitempty"`
	Version   string `json:"version,omitempty"`
}

// Status bundles in-memory cache system statuses.
type Status struct {
	Redis     RedisStatus     `json:"redis"`
	Memcached MemcachedStatus `json:"memcached"`
}

// Service manages Redis and in-memory caching daemons.
type Service struct {
	cfg   config.Config
	audit *audit.Log
}

// New creates a new Caching service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{
		cfg:   cfg,
		audit: auditLog,
	}
}

var redisSocketCandidates = []string{
	"/var/run/redis/redis.sock",
	"/var/run/redis/redis-server.sock",
	"/run/redis/redis-server.sock",
	"/run/redis/redis.sock",
	"/tmp/redis.sock",
	"/opt/homebrew/var/run/redis.sock",
}

// DetectSocket locates an active Redis unix domain socket, or the preferred location.
func DetectSocket() string {
	for _, p := range redisSocketCandidates {
		if fi, err := os.Stat(p); err == nil && (fi.Mode()&os.ModeSocket != 0 || !fi.IsDir()) {
			return p
		}
	}
	return "/var/run/redis/redis.sock"
}

// Status returns current daemon detection, socket paths, memory stats, and keys.
func (s *Service) Status(ctx context.Context) Status {
	return Status{
		Redis:     s.probeRedis(ctx),
		Memcached: s.probeMemcached(ctx),
	}
}

func (s *Service) probeRedis(ctx context.Context) RedisStatus {
	st := RedisStatus{
		Port:       6379,
		SocketPath: DetectSocket(),
	}

	// 1. Detect binary / daemon name
	daemons := []string{"redis-server", "valkey-server", "redis"}
	for _, d := range daemons {
		if p, err := exec.LookPath(d); err == nil {
			st.Installed = true
			st.DaemonName = d
			// Attempt version check
			if out, vErr := exec.CommandContext(ctx, p, "--version").Output(); vErr == nil {
				if m := regexp.MustCompile(`v=([0-9.]+)`).FindStringSubmatch(string(out)); len(m) > 1 {
					st.Version = m[1]
				}
			}
			break
		}
	}

	// Also check systemd service files or common paths
	if !st.Installed {
		for _, sp := range []string{"/usr/bin/redis-server", "/usr/sbin/redis-server", "/usr/local/bin/redis-server"} {
			if _, err := os.Stat(sp); err == nil {
				st.Installed = true
				st.DaemonName = "redis-server"
				break
			}
		}
	}

	// 2. Check if running (via socket or TCP probe)
	conn, err := connectRedis(st.SocketPath)
	if err == nil {
		st.Running = true
		st.Installed = true
		if st.DaemonName == "" {
			st.DaemonName = "redis-server"
		}
		defer conn.Close()

		// Read INFO from connection
		infoMap := fetchRedisInfo(conn)
		if v, ok := infoMap["redis_version"]; ok && st.Version == "" {
			st.Version = v
		}
		st.UsedMemory = infoMap["used_memory_human"]
		st.PeakMemory = infoMap["used_memory_peak_human"]
		st.MaxMemory = infoMap["maxmemory_human"]
		if st.MaxMemory == "" || st.MaxMemory == "0B" {
			st.MaxMemory = "Unlimited"
		}
		if clients, ok := infoMap["connected_clients"]; ok {
			st.ConnectedClients, _ = strconv.Atoi(clients)
		}
		if uptime, ok := infoMap["uptime_in_days"]; ok {
			st.UptimeDays, _ = strconv.Atoi(uptime)
		}

		// Calculate total keys across db0..db15
		var totalKeys int64
		for k, val := range infoMap {
			if strings.HasPrefix(k, "db") && strings.Contains(val, "keys=") {
				m := regexp.MustCompile(`keys=([0-9]+)`).FindStringSubmatch(val)
				if len(m) > 1 {
					if n, pErr := strconv.ParseInt(m[1], 10, 64); pErr == nil {
						totalKeys += n
					}
				}
			}
		}
		st.TotalKeys = totalKeys
		return st
	}

	// Fallback process check if port/socket didn't connect
	if !st.Running {
		if out, pErr := exec.CommandContext(ctx, "pgrep", "-f", "redis-server").Output(); pErr == nil && len(strings.TrimSpace(string(out))) > 0 {
			st.Running = true
			st.Installed = true
		}
	}

	if st.UsedMemory == "" {
		st.UsedMemory = "0B"
	}
	if st.PeakMemory == "" {
		st.PeakMemory = "0B"
	}
	if st.MaxMemory == "" {
		st.MaxMemory = "Unlimited"
	}

	return st
}

func (s *Service) probeMemcached(ctx context.Context) MemcachedStatus {
	st := MemcachedStatus{Port: 11211}
	if p, err := exec.LookPath("memcached"); err == nil {
		st.Installed = true
		if out, vErr := exec.CommandContext(ctx, p, "-h").Output(); vErr == nil {
			if m := regexp.MustCompile(`memcached ([0-9.]+)`).FindStringSubmatch(string(out)); len(m) > 1 {
				st.Version = m[1]
			}
		}
	}

	// Probe port 11211
	c, err := net.DialTimeout("tcp", "127.0.0.1:11211", 300*time.Millisecond)
	if err == nil {
		st.Running = true
		st.Installed = true
		c.Close()
	} else if out, pErr := exec.CommandContext(ctx, "pgrep", "-x", "memcached").Output(); pErr == nil && len(strings.TrimSpace(string(out))) > 0 {
		st.Running = true
		st.Installed = true
	}

	return st
}

func connectRedis(sockPath string) (net.Conn, error) {
	// Try unix socket first if it exists
	if _, err := os.Stat(sockPath); err == nil {
		if c, err := net.DialTimeout("unix", sockPath, 400*time.Millisecond); err == nil {
			return c, nil
		}
	}
	// Try loopback TCP
	return net.DialTimeout("tcp", "127.0.0.1:6379", 400*time.Millisecond)
}

func fetchRedisInfo(conn net.Conn) map[string]string {
	res := make(map[string]string)
	_ = conn.SetDeadline(time.Now().Add(1 * time.Second))
	if _, err := fmt.Fprintf(conn, "INFO\r\n"); err != nil {
		return res
	}

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// End of INFO payload if we encounter empty or non-key line after content
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			res[parts[0]] = parts[1]
		}
		if len(res) > 80 {
			break
		}
	}
	return res
}

// Flush executes FLUSHALL to clear the in-memory cache.
func (s *Service) Flush(ctx context.Context) error {
	if s.cfg.DryRun {
		return nil
	}

	// 1. Try socket/TCP direct command
	conn, err := connectRedis(DetectSocket())
	if err == nil {
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
		if _, wErr := fmt.Fprintf(conn, "FLUSHALL\r\n"); wErr == nil {
			reader := bufio.NewReader(conn)
			resp, rErr := reader.ReadString('\n')
			if rErr == nil && strings.HasPrefix(resp, "+OK") {
				s.recordAudit("caching.redis.flush", nil)
				return nil
			}
		}
	}

	// 2. Try CLI fallback
	if cli, lookErr := exec.LookPath("redis-cli"); lookErr == nil {
		cmd := exec.CommandContext(ctx, cli, "flushall")
		if err := cmd.Run(); err == nil {
			s.recordAudit("caching.redis.flush", nil)
			return nil
		}
	}

	return fmt.Errorf("unable to connect to Redis to flush cache (service may be stopped)")
}

// Toggle changes Redis daemon state (action: "start", "stop", "restart").
func (s *Service) Toggle(ctx context.Context, action string) error {
	action = strings.ToLower(strings.TrimSpace(action))
	if action != "start" && action != "stop" && action != "restart" {
		return fmt.Errorf("invalid toggle action: %s (must be start, stop, or restart)", action)
	}

	if s.cfg.DryRun {
		s.recordAudit("caching.redis.toggle", map[string]any{"action": action, "dryRun": true})
		return nil
	}

	daemonNames := []string{"redis-server", "redis", "valkey-server", "valkey"}
	var lastErr error

	for _, d := range daemonNames {
		cmd := exec.CommandContext(ctx, "systemctl", action, d)
		if err := cmd.Run(); err == nil {
			s.recordAudit("caching.redis.toggle", map[string]any{"action": action, "daemon": d})
			return nil
		} else {
			lastErr = err
		}
	}

	// Fallback to service command (containers without systemd)
	for _, d := range daemonNames {
		cmd := exec.CommandContext(ctx, "service", d, action)
		if err := cmd.Run(); err == nil {
			s.recordAudit("caching.redis.toggle", map[string]any{"action": action, "daemon": d})
			return nil
		}
	}

	return fmt.Errorf("failed to %s redis service: %w", action, lastErr)
}

func (s *Service) recordAudit(action string, params map[string]any) {
	if s.audit == nil {
		return
	}
	_ = s.audit.Append(audit.Record{
		Action: action,
		Params: params,
		Result: audit.ResultAccepted,
	})
}
