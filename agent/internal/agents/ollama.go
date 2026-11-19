package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/tasks"
)

// OllamaModel represents an installed local model in Ollama.
type OllamaModel struct {
	Name       string    `json:"name"`
	Model      string    `json:"model"`
	Size       int64     `json:"size"`
	Digest     string    `json:"digest"`
	ModifiedAt time.Time `json:"modifiedAt"`
}

// OllamaTagsResponse matches Ollama API /api/tags response format.
type OllamaTagsResponse struct {
	Models []OllamaModel `json:"models"`
}

// ListOllamaModels queries the local Ollama daemon for installed models.
func (m *Manager) ListOllamaModels(ctx context.Context) ([]OllamaModel, error) {
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", "http://127.0.0.1:11434/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		// Fallback to CLI command if daemon API direct connection failed
		return listOllamaModelsCLI(ctx)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama API status %d", resp.StatusCode)
	}

	var data OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data.Models, nil
}

func listOllamaModelsCLI(ctx context.Context) ([]OllamaModel, error) {
	cmd := exec.CommandContext(ctx, "ollama", "list")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) <= 1 {
		return nil, nil
	}

	var models []OllamaModel
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) >= 1 {
			models = append(models, OllamaModel{
				Name:  fields[0],
				Model: fields[0],
			})
		}
	}
	return models, nil
}

// PullOllamaModel pulls the specified model from the Ollama library.
func (m *Manager) PullOllamaModel(ctx context.Context, log tasks.LogFunc, modelName string) error {
	if modelName == "" {
		modelName = "qwen2.5-coder:1.5b"
	}
	log("info", fmt.Sprintf("Pulling Ollama model: %s...", modelName))

	const pullTimeout = 30 * time.Minute
	err := safeexec.RunTimeout(ctx, m.cfg.DryRun, log, pullTimeout, "ollama", "pull", modelName)
	if err != nil {
		log("error", fmt.Sprintf("Failed to pull model %s: %v", modelName, err))
		return fmt.Errorf("ollama pull %s: %w", modelName, err)
	}

	log("info", fmt.Sprintf("Successfully pulled Ollama model: %s", modelName))
	return nil
}
