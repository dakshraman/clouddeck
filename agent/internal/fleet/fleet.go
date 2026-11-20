package fleet

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// NodeStats reflects vital system telemetry of a fleet node.
type NodeStats struct {
	CPUUsagePct  float64 `json:"cpuUsagePct"`
	RAMUsagePct  float64 `json:"ramUsagePct"`
	DiskUsagePct float64 `json:"diskUsagePct"`
	SitesCount   int     `json:"sitesCount"`
	Load1        float64 `json:"load1"`
}

// FleetNode represents a registered server in the multi-server cluster.
type FleetNode struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	Token     string    `json:"token,omitempty"`
	Tags      []string  `json:"tags"`
	Status    string    `json:"status"` // "online", "offline", "unreachable"
	LastPing  time.Time `json:"lastPing"`
	LatencyMs int64     `json:"latencyMs"`
	Version   string    `json:"version"`
	Stats     NodeStats `json:"stats"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// FleetOverview aggregates cluster-wide health, capacity, and node statuses.
type FleetOverview struct {
	TotalNodes   int         `json:"totalNodes"`
	OnlineNodes  int         `json:"onlineNodes"`
	OfflineNodes int         `json:"offlineNodes"`
	TotalSites   int         `json:"totalSites"`
	AvgCPU       float64     `json:"avgCpu"`
	AvgRAM       float64     `json:"avgRam"`
	AvgDisk      float64     `json:"avgDisk"`
	Nodes        []FleetNode `json:"nodes"`
}

// RegisterNodeInput specifies parameters for adding a new node.
type RegisterNodeInput struct {
	Name  string   `json:"name"`
	Host  string   `json:"host"`
	Port  int      `json:"port"`
	Token string   `json:"token"`
	Tags  []string `json:"tags,omitempty"`
}

// UpdateNodeInput specifies parameters for updating an existing node.
type UpdateNodeInput struct {
	Name  string   `json:"name,omitempty"`
	Host  string   `json:"host,omitempty"`
	Port  int      `json:"port,omitempty"`
	Token string   `json:"token,omitempty"`
	Tags  []string `json:"tags,omitempty"`
}

// Service manages the server cluster and health probes.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.RWMutex
	nodes map[string]FleetNode
}

const fleetDataFile = "fleet_nodes.json"

// New creates a new Fleet service and loads persisted cluster state.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	s := &Service{
		cfg:   cfg,
		audit: auditLog,
		nodes: make(map[string]FleetNode),
	}
	s.load()
	return s
}

func (s *Service) dataPath() string {
	return filepath.Join(s.cfg.StateDir, fleetDataFile)
}

func (s *Service) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.dataPath())
	if err == nil {
		var list []FleetNode
		if err := json.Unmarshal(data, &list); err == nil {
			for _, n := range list {
				s.nodes[n.ID] = n
			}
		}
	}

	// Ensure local primary controller is registered by default
	if len(s.nodes) == 0 {
		localID := "node_primary"
		now := time.Now().UTC()
		s.nodes[localID] = FleetNode{
			ID:        localID,
			Name:      "Primary Controller (Local)",
			Host:      "127.0.0.1",
			Port:      8080,
			Tags:      []string{"primary", "controller", "edge"},
			Status:    "online",
			LastPing:  now,
			LatencyMs: 1,
			Version:   "0.6.54",
			Stats: NodeStats{
				CPUUsagePct:  12.5,
				RAMUsagePct:  34.2,
				DiskUsagePct: 22.0,
				SitesCount:   1,
				Load1:        0.18,
			},
			CreatedAt: now,
			UpdatedAt: now,
		}
		_ = s.saveUnlocked()
	}
}

func (s *Service) saveUnlocked() error {
	list := make([]FleetNode, 0, len(s.nodes))
	for _, n := range s.nodes {
		list = append(list, n)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.dataPath(), data, 0o644)
}

// ListNodes returns all registered nodes.
func (s *Service) ListNodes() []FleetNode {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make([]FleetNode, 0, len(s.nodes))
	for _, n := range s.nodes {
		res = append(res, n)
	}
	return res
}

// GetNode retrieves a single node by ID.
func (s *Service) GetNode(id string) (FleetNode, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	n, ok := s.nodes[id]
	if !ok {
		return FleetNode{}, apierr.NotFound("node_not_found", fmt.Sprintf("node %q not found", id))
	}
	return n, nil
}

// RegisterNode adds a new node to the cluster.
func (s *Service) RegisterNode(ctx context.Context, in RegisterNodeInput) (FleetNode, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return FleetNode{}, apierr.BadRequest("missing_name", "node name is required")
	}
	host := strings.TrimSpace(in.Host)
	if host == "" {
		return FleetNode{}, apierr.BadRequest("missing_host", "node host or IP is required")
	}
	port := in.Port
	if port <= 0 || port > 65535 {
		port = 8080
	}

	nodeID := "node_" + randomHex(6)
	now := time.Now().UTC()

	node := FleetNode{
		ID:        nodeID,
		Name:      name,
		Host:      host,
		Port:      port,
		Token:     in.Token,
		Tags:      in.Tags,
		Status:    "online",
		LastPing:  now,
		LatencyMs: 12,
		Version:   "0.6.54",
		Stats: NodeStats{
			CPUUsagePct:  8.0,
			RAMUsagePct:  25.0,
			DiskUsagePct: 15.0,
			SitesCount:   0,
			Load1:        0.10,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	if node.Tags == nil {
		node.Tags = []string{"worker"}
	}

	s.mu.Lock()
	s.nodes[nodeID] = node
	_ = s.saveUnlocked()
	s.mu.Unlock()

	// Probe node
	probed, _ := s.PingNode(ctx, nodeID)

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "fleet.node.register",
			Params: map[string]any{"id": nodeID, "name": name, "host": host, "port": port},
			Result: audit.ResultAccepted,
		})
	}

	return probed, nil
}

// UpdateNode updates an existing node's configuration.
func (s *Service) UpdateNode(ctx context.Context, id string, in UpdateNodeInput) (FleetNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	node, ok := s.nodes[id]
	if !ok {
		return FleetNode{}, apierr.NotFound("node_not_found", fmt.Sprintf("node %q not found", id))
	}

	if in.Name != "" {
		node.Name = strings.TrimSpace(in.Name)
	}
	if in.Host != "" {
		node.Host = strings.TrimSpace(in.Host)
	}
	if in.Port > 0 && in.Port <= 65535 {
		node.Port = in.Port
	}
	if in.Token != "" {
		node.Token = in.Token
	}
	if in.Tags != nil {
		node.Tags = in.Tags
	}
	node.UpdatedAt = time.Now().UTC()

	s.nodes[id] = node
	_ = s.saveUnlocked()

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "fleet.node.update",
			Params: map[string]any{"id": id, "name": node.Name},
			Result: audit.ResultAccepted,
		})
	}

	return node, nil
}

// DeleteNode removes a node from the cluster.
func (s *Service) DeleteNode(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id == "node_primary" {
		return apierr.BadRequest("cannot_delete_primary", "cannot delete the primary controller node")
	}

	if _, ok := s.nodes[id]; !ok {
		return apierr.NotFound("node_not_found", fmt.Sprintf("node %q not found", id))
	}

	delete(s.nodes, id)
	_ = s.saveUnlocked()

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "fleet.node.delete",
			Params: map[string]any{"id": id},
			Result: audit.ResultAccepted,
		})
	}

	return nil
}

// PingNode sends a health probe to the node and updates latency and status.
func (s *Service) PingNode(ctx context.Context, id string) (FleetNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	node, ok := s.nodes[id]
	if !ok {
		return FleetNode{}, apierr.NotFound("node_not_found", fmt.Sprintf("node %q not found", id))
	}

	start := time.Now()
	now := time.Now().UTC()

	// In test, dry-run, or for localhost, simulate immediate healthy ping
	if s.cfg.DryRun || node.Host == "127.0.0.1" || node.Host == "localhost" {
		node.Status = "online"
		node.LastPing = now
		node.LatencyMs = 2
		s.nodes[id] = node
		_ = s.saveUnlocked()
		return node, nil
	}

	// Probe live remote node
	targetURL := fmt.Sprintf("http://%s:%d/v1/health", node.Host, node.Port)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		node.Status = "unreachable"
		node.LastPing = now
		s.nodes[id] = node
		_ = s.saveUnlocked()
		return node, nil
	}
	if node.Token != "" {
		req.Header.Set("X-CloudDeck-Agent-Token", node.Token)
	}

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()

	if err != nil || resp.StatusCode >= 400 {
		node.Status = "unreachable"
		node.LatencyMs = latency
		node.LastPing = now
	} else {
		_ = resp.Body.Close()
		node.Status = "online"
		node.LatencyMs = latency
		node.LastPing = now
	}

	s.nodes[id] = node
	_ = s.saveUnlocked()
	return node, nil
}

// GetOverview aggregates cluster statistics across all registered nodes.
func (s *Service) GetOverview(ctx context.Context) FleetOverview {
	s.mu.RLock()
	defer s.mu.RUnlock()

	overview := FleetOverview{
		TotalNodes: len(s.nodes),
		Nodes:      make([]FleetNode, 0, len(s.nodes)),
	}

	var sumCPU, sumRAM, sumDisk float64
	for _, n := range s.nodes {
		overview.Nodes = append(overview.Nodes, n)
		if n.Status == "online" {
			overview.OnlineNodes++
		} else {
			overview.OfflineNodes++
		}
		overview.TotalSites += n.Stats.SitesCount
		sumCPU += n.Stats.CPUUsagePct
		sumRAM += n.Stats.RAMUsagePct
		sumDisk += n.Stats.DiskUsagePct
	}

	if overview.TotalNodes > 0 {
		overview.AvgCPU = sumCPU / float64(overview.TotalNodes)
		overview.AvgRAM = sumRAM / float64(overview.TotalNodes)
		overview.AvgDisk = sumDisk / float64(overview.TotalNodes)
	}

	return overview
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
