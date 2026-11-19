// Package agents discovers, inspects, installs, and uninstalls autonomous
// AI coding agents (Claude Code, OpenAI Codex, Google Antigravity, and OpenCode).
package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/tasks"
)

// Agent describes an AI coding agent and its current host status.
type Agent struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Command      string   `json:"command"`
	Installed    bool     `json:"installed"`
	Version      string   `json:"version,omitempty"`
	Path         string   `json:"path,omitempty"`
	Description  string   `json:"description"`
	Capabilities []string `json:"capabilities"`
}

// Spec defines the static metadata and lifecycle actions for an agent.
type Spec struct {
	ID              string
	Name            string
	Command         string
	AltCommands     []string
	Aliases         []string
	Description     string
	Capabilities    []string
	NpmPackage      string
	InstallScript   string
	UninstallScript string
}

var versionRe = regexp.MustCompile(`v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9_.-]+)?)`)

// Specs holds the supported AI coding agents.
var Specs = []Spec{
	{
		ID:           "claude-code",
		Name:         "Claude Code",
		Command:      "claude",
		Aliases:      []string{"claude", "claude-code", "anthropic-claude"},
		Description:  "Anthropic's autonomous coding agent running directly in the terminal.",
		Capabilities: []string{"Autonomous coding", "Terminal integration", "Git operations", "Subagent orchestration"},
		NpmPackage:   "@anthropic-ai/claude-code",
	},
	{
		ID:           "codex",
		Name:         "OpenAI Codex",
		Command:      "codex",
		Aliases:      []string{"codex", "openai-codex"},
		Description:  "OpenAI's AI coding assistant and CLI code generation agent.",
		Capabilities: []string{"Code synthesis", "Shell execution", "Refactoring", "Test generation"},
		NpmPackage:   "@openai/codex",
	},
	{
		ID:           "antigravity",
		Name:         "Google Antigravity",
		Command:      "agy",
		AltCommands:  []string{"antigravity"},
		Aliases:      []string{"antigravity", "agy", "google-antigravity"},
		Description:  "Google DeepMind's agentic AI coding and workflow orchestration assistant.",
		Capabilities: []string{"Swarm coordination", "Multi-agent workflows", "Full-stack auditing", "Tool execution"},
		InstallScript: "curl -fsSL https://antigravity.google.com/install.sh | bash",
		UninstallScript: "rm -f /usr/local/bin/agy /usr/local/bin/antigravity /usr/bin/agy /usr/bin/antigravity ~/.local/bin/agy ~/.local/bin/antigravity 2>/dev/null || true",
	},
	{
		ID:           "opencode",
		Name:         "OpenCode",
		Command:      "opencode",
		Aliases:      []string{"opencode", "opencode-ai"},
		Description:  "Open-source autonomous terminal-based AI programmer.",
		Capabilities: []string{"Local & remote LLMs", "Terminal workspace", "Multi-file edits", "Git integration"},
		NpmPackage:   "opencode-ai",
	},
}

// Manager manages AI coding agents inspection and lifecycle.
type Manager struct {
	cfg   config.Config
	audit *audit.Log

	mu        sync.RWMutex
	cachedAt  time.Time
	cachedList []Agent
}

// New creates an agents Manager.
func New(cfg config.Config, auditLog *audit.Log) *Manager {
	return &Manager{
		cfg:   cfg,
		audit: auditLog,
	}
}

// FindSpec finds a spec by id, alias, or command name.
func FindSpec(identifier string) (Spec, bool) {
	key := strings.ToLower(strings.TrimSpace(identifier))
	for _, spec := range Specs {
		if strings.ToLower(spec.ID) == key || strings.ToLower(spec.Command) == key {
			return spec, true
		}
		for _, alt := range spec.AltCommands {
			if strings.ToLower(alt) == key {
				return spec, true
			}
		}
		for _, alias := range spec.Aliases {
			if strings.ToLower(alias) == key {
				return spec, true
			}
		}
	}
	return Spec{}, false
}

// InvalidateCache clears the probed agent cache.
func (m *Manager) InvalidateCache() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cachedList = nil
	m.cachedAt = time.Time{}
}

// List returns all supported agents with their live host detection status.
func (m *Manager) List(ctx context.Context) []Agent {
	m.mu.RLock()
	if time.Since(m.cachedAt) < 5*time.Second && m.cachedList != nil {
		out := make([]Agent, len(m.cachedList))
		copy(out, m.cachedList)
		m.mu.RUnlock()
		return out
	}
	m.mu.RUnlock()

	list := make([]Agent, 0, len(Specs))
	for _, spec := range Specs {
		agent := m.probe(ctx, spec)
		list = append(list, agent)
	}

	m.mu.Lock()
	m.cachedList = list
	m.cachedAt = time.Now()
	m.mu.Unlock()

	return list
}

// Get returns one agent by identifier.
func (m *Manager) Get(ctx context.Context, identifier string) (Agent, bool) {
	spec, ok := FindSpec(identifier)
	if !ok {
		return Agent{}, false
	}
	return m.probe(ctx, spec), true
}

func (m *Manager) probe(ctx context.Context, spec Spec) Agent {
	agent := Agent{
		ID:           spec.ID,
		Name:         spec.Name,
		Command:      spec.Command,
		Description:  spec.Description,
		Capabilities: spec.Capabilities,
	}

	// 1. Locate executable
	path, activeCmd := findExecutable(spec)
	if path != "" {
		agent.Installed = true
		agent.Path = path
		if activeCmd != "" {
			agent.Command = activeCmd
		}
	}

	// 2. Try package.json version if npm package
	if spec.NpmPackage != "" {
		if v := readNpmPackageVersion(spec.NpmPackage); v != "" {
			agent.Version = v
			agent.Installed = true
		}
	}

	// 3. If binary found, probe version via CLI if not yet resolved
	if agent.Installed && agent.Version == "" && path != "" {
		if v := probeCliVersion(ctx, path); v != "" {
			agent.Version = v
		}
	}

	return agent
}

func findExecutable(spec Spec) (string, string) {
	candidates := append([]string{spec.Command}, spec.AltCommands...)
	for _, cmd := range candidates {
		// Look in PATH
		if p, err := exec.LookPath(cmd); err == nil && isExecutable(p) {
			return p, cmd
		}

		// Look in standard system / user paths
		standardPaths := []string{
			filepath.Join("/usr/local/bin", cmd),
			filepath.Join("/usr/bin", cmd),
			filepath.Join(os.Getenv("HOME"), ".local/bin", cmd),
			filepath.Join(os.Getenv("HOME"), ".npm-global/bin", cmd),
		}
		for _, sp := range standardPaths {
			if isExecutable(sp) {
				return sp, cmd
			}
		}
	}
	return "", ""
}

func isExecutable(path string) bool {
	if strings.HasPrefix(path, "/mnt/") {
		return false
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode()&0o111 != 0
}

func readNpmPackageVersion(pkgName string) string {
	candidates := []string{
		filepath.Join("/usr/local/lib/node_modules", pkgName, "package.json"),
		filepath.Join("/usr/lib/node_modules", pkgName, "package.json"),
		filepath.Join(os.Getenv("HOME"), ".npm-global/lib/node_modules", pkgName, "package.json"),
	}

	for _, c := range candidates {
		data, err := os.ReadFile(c)
		if err != nil {
			continue
		}
		var pkg struct {
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &pkg); err == nil && pkg.Version != "" {
			return pkg.Version
		}
	}
	return ""
}

func probeCliVersion(ctx context.Context, binPath string) string {
	probeCtx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	cmd := exec.CommandContext(probeCtx, binPath, "--version")
	cmd.Env = append(os.Environ(), "DONT_PROMPT_WSL_INSTALL=1")
	cmd.Stdin = strings.NewReader("")
	out, err := cmd.Output()
	if err == nil {
		if m := versionRe.FindSubmatch(out); len(m) > 1 {
			return string(m[1])
		}
	}

	// Fallback to -v
	cmdV := exec.CommandContext(probeCtx, binPath, "-v")
	cmdV.Env = append(os.Environ(), "DONT_PROMPT_WSL_INSTALL=1")
	cmdV.Stdin = strings.NewReader("")
	outV, errV := cmdV.Output()
	if errV == nil {
		if m := versionRe.FindSubmatch(outV); len(m) > 1 {
			return string(m[1])
		}
	}

	return ""
}

// Install runs the installation procedure for the requested agent.
func (m *Manager) Install(ctx context.Context, log tasks.LogFunc, identifier string) error {
	spec, ok := FindSpec(identifier)
	if !ok {
		return apierr.BadRequest("unknown_agent", fmt.Sprintf("unrecognized agent %q", identifier))
	}

	defer m.InvalidateCache()

	log("info", fmt.Sprintf("Starting installation of %s (%s)...", spec.Name, spec.ID))

	const installTimeout = 15 * time.Minute

	var err error
	if spec.NpmPackage != "" {
		log("info", fmt.Sprintf("Running npm install -g %s", spec.NpmPackage))
		err = safeexec.RunTimeout(ctx, m.cfg.DryRun, log, installTimeout, "npm", "install", "-g", spec.NpmPackage)
	} else if spec.InstallScript != "" {
		log("info", fmt.Sprintf("Running install script: %s", spec.InstallScript))
		err = safeexec.RunTimeout(ctx, m.cfg.DryRun, log, installTimeout, "bash", "-c", spec.InstallScript)
	} else {
		err = fmt.Errorf("no install recipe defined for %s", spec.ID)
	}

	if err != nil {
		log("error", fmt.Sprintf("Installation of %s failed: %v", spec.Name, err))
		if m.audit != nil {
			_ = m.audit.Append(audit.Record{
				Action: "agent.install",
				Params: map[string]any{"agent": spec.ID},
				Result: audit.ResultRejected,
				Error:  err.Error(),
			})
		}
		return fmt.Errorf("install %s: %w", spec.ID, err)
	}

	log("info", fmt.Sprintf("Successfully installed %s!", spec.Name))
	if m.audit != nil {
		_ = m.audit.Append(audit.Record{
			Action: "agent.install",
			Params: map[string]any{"agent": spec.ID},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}

// Uninstall removes the requested agent from the host.
func (m *Manager) Uninstall(ctx context.Context, log tasks.LogFunc, identifier string) error {
	spec, ok := FindSpec(identifier)
	if !ok {
		return apierr.BadRequest("unknown_agent", fmt.Sprintf("unrecognized agent %q", identifier))
	}

	defer m.InvalidateCache()

	log("info", fmt.Sprintf("Starting uninstall of %s (%s)...", spec.Name, spec.ID))

	const uninstallTimeout = 5 * time.Minute

	var err error
	if spec.NpmPackage != "" {
		log("info", fmt.Sprintf("Running npm uninstall -g %s", spec.NpmPackage))
		err = safeexec.RunTimeout(ctx, m.cfg.DryRun, log, uninstallTimeout, "npm", "uninstall", "-g", spec.NpmPackage)
		// Clean up any remaining binary in /usr/local/bin or standard paths
		if !m.cfg.DryRun {
			for _, cmd := range append([]string{spec.Command}, spec.AltCommands...) {
				_ = os.Remove(filepath.Join("/usr/local/bin", cmd))
			}
		}
	} else if spec.UninstallScript != "" {
		log("info", fmt.Sprintf("Running uninstall script: %s", spec.UninstallScript))
		err = safeexec.RunTimeout(ctx, m.cfg.DryRun, log, uninstallTimeout, "bash", "-c", spec.UninstallScript)
	} else {
		err = fmt.Errorf("no uninstall recipe defined for %s", spec.ID)
	}

	if err != nil {
		log("error", fmt.Sprintf("Uninstall of %s failed: %v", spec.Name, err))
		if m.audit != nil {
			_ = m.audit.Append(audit.Record{
				Action: "agent.uninstall",
				Params: map[string]any{"agent": spec.ID},
				Result: audit.ResultRejected,
				Error:  err.Error(),
			})
		}
		return fmt.Errorf("uninstall %s: %w", spec.ID, err)
	}

	log("info", fmt.Sprintf("Successfully uninstalled %s.", spec.Name))
	if m.audit != nil {
		_ = m.audit.Append(audit.Record{
			Action: "agent.uninstall",
			Params: map[string]any{"agent": spec.ID},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}
