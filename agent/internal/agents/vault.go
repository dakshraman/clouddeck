package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// SupportedKeyNames lists standard LLM credential environment variable names.
var SupportedKeyNames = []string{
	"ANTHROPIC_API_KEY",
	"OPENAI_API_KEY",
	"GEMINI_API_KEY",
	"DEEPSEEK_API_KEY",
	"OLLAMA_HOST",
	"GROQ_API_KEY",
}

// MaskedKey represents a stored API key without leaking the secret value.
type MaskedKey struct {
	Name      string `json:"name"`
	IsSet     bool   `json:"isSet"`
	MaskedVal string `json:"maskedVal"`
}

// Vault manages secure persistent storage and retrieval of AI provider API keys.
type Vault struct {
	cfg      config.Config
	audit    *audit.Log
	mu       sync.RWMutex
	filePath string
	cached   map[string]string
}

// NewVault creates a new Vault manager.
func NewVault(cfg config.Config, auditLog *audit.Log) *Vault {
	path := ""
	if cfg.StateDir != "" && cfg.StateDir != "/var/lib/clouddeck" {
		path = filepath.Join(cfg.StateDir, "agent_keys.json")
	} else {
		canWrite := false
		if fi, err := os.Stat("/var/lib/clouddeck"); err == nil && fi.IsDir() {
			testFile := filepath.Join("/var/lib/clouddeck", ".write_test")
			if err := os.WriteFile(testFile, []byte(""), 0o600); err == nil {
				_ = os.Remove(testFile)
				canWrite = true
			}
		}
		if canWrite {
			path = "/var/lib/clouddeck/agent_keys.json"
		} else {
			home, _ := os.UserHomeDir()
			if home != "" {
				path = filepath.Join(home, ".clouddeck", "agent_keys.json")
			} else {
				path = filepath.Join(os.TempDir(), "clouddeck-agent-keys.json")
			}
		}
	}

	v := &Vault{
		cfg:      cfg,
		audit:    auditLog,
		filePath: path,
		cached:   make(map[string]string),
	}
	_ = v.load()
	return v
}

func (v *Vault) load() error {
	v.mu.Lock()
	defer v.mu.Unlock()

	data, err := os.ReadFile(v.filePath)
	if err != nil {
		return err
	}

	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	v.cached = m
	return nil
}

func (v *Vault) save() error {
	_ = os.MkdirAll(filepath.Dir(v.filePath), 0o700)
	data, err := json.MarshalIndent(v.cached, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(v.filePath, data, 0o600)
}

// MaskValue masks an API key, revealing only prefix and suffix.
func MaskValue(val string) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return ""
	}
	if len(val) <= 8 {
		return "••••••••"
	}
	prefixLen := 4
	if strings.HasPrefix(val, "sk-ant-") {
		prefixLen = 7
	} else if strings.HasPrefix(val, "sk-") {
		prefixLen = 3
	}
	if len(val) <= prefixLen+4 {
		return val[:prefixLen] + "••••"
	}
	return val[:prefixLen] + "••••••••" + val[len(val)-4:]
}

// GetMaskedKeys returns all supported keys with their presence and masked representation.
func (v *Vault) GetMaskedKeys(ctx context.Context) []MaskedKey {
	v.mu.RLock()
	defer v.mu.RUnlock()

	var result []MaskedKey
	for _, k := range SupportedKeyNames {
		raw := v.cached[k]
		if raw == "" {
			raw = os.Getenv(k)
		}
		result = append(result, MaskedKey{
			Name:      k,
			IsSet:     raw != "",
			MaskedVal: MaskValue(raw),
		})
	}
	return result
}

// SetKeys updates or deletes stored keys. An empty string value removes the key.
func (v *Vault) SetKeys(ctx context.Context, updates map[string]string) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	for k, val := range updates {
		k = strings.TrimSpace(k)
		val = strings.TrimSpace(val)
		if val == "" {
			delete(v.cached, k)
		} else {
			v.cached[k] = val
		}
	}

	if err := v.save(); err != nil {
		return fmt.Errorf("save vault: %w", err)
	}

	if v.audit != nil {
		var updatedNames []string
		for k := range updates {
			updatedNames = append(updatedNames, k)
		}
		_ = v.audit.Append(audit.Record{
			Action: "agent.vault.update",
			Params: map[string]any{"keys": updatedNames},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}

// GetEnvironment returns KEY=value pairs for injecting into terminal sessions and processes.
func (v *Vault) GetEnvironment() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()

	var env []string
	for k, val := range v.cached {
		if strings.TrimSpace(val) != "" {
			env = append(env, fmt.Sprintf("%s=%s", k, val))
		}
	}
	return env
}

// GetRawKey returns the raw secret for a given key, checking vault then os.Getenv.
func (v *Vault) GetRawKey(key string) string {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if val := v.cached[key]; val != "" {
		return val
	}
	return os.Getenv(key)
}
