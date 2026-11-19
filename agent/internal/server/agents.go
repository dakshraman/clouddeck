package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"clouddeck/agent/internal/agents"
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/tasks"
)

// handleListAgents returns all supported AI coding agents and their host installation status.
func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	list := s.agents.List(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"agents": list,
	})
}

// handleAgentInstall starts a background task installing an AI coding agent.
func (s *Server) handleAgentInstall(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Agent string `json:"agent"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	req.Agent = strings.TrimSpace(req.Agent)
	if req.Agent == "" {
		writeError(w, apierr.BadRequest("missing_agent", "agent field is required"))
		return
	}

	spec, ok := agents.FindSpec(req.Agent)
	if !ok {
		writeError(w, apierr.NotFound("agent_not_found", fmt.Sprintf("AI agent %q is not recognized", req.Agent)))
		return
	}

	task, err := s.eng.Create("agent.install", "", func(ctx context.Context, log tasks.LogFunc) error {
		return s.agents.Install(ctx, log, spec.ID)
	})
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"task":    task,
		"agent":   spec.ID,
		"success": true,
	})
}

// handleAgentUninstall starts a background task removing an AI coding agent from the host.
func (s *Server) handleAgentUninstall(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("id")
	if agentID == "" {
		var req struct {
			Agent string `json:"agent"`
		}
		if err := decodeBody(w, r, &req); err == nil && req.Agent != "" {
			agentID = req.Agent
		}
	}

	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		writeError(w, apierr.BadRequest("missing_agent", "agent field is required"))
		return
	}

	spec, ok := agents.FindSpec(agentID)
	if !ok {
		writeError(w, apierr.NotFound("agent_not_found", fmt.Sprintf("AI agent %q is not recognized", agentID)))
		return
	}

	task, err := s.eng.Create("agent.uninstall", "", func(ctx context.Context, log tasks.LogFunc) error {
		return s.agents.Uninstall(ctx, log, spec.ID)
	})
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"task":    task,
		"agent":   spec.ID,
		"success": true,
	})
}

// handleListOllamaModels lists installed local Ollama models.
func (s *Server) handleListOllamaModels(w http.ResponseWriter, r *http.Request) {
	models, err := s.agents.ListOllamaModels(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"models": []agents.OllamaModel{},
			"error":  err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"models": models,
	})
}

// handleOllamaPull pulls a model from the Ollama library in a background task.
func (s *Server) handleOllamaPull(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Model string `json:"model"`
	}
	if err := decodeBody(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	modelName := strings.TrimSpace(req.Model)
	if modelName == "" {
		modelName = "qwen2.5-coder:1.5b"
	}

	task, err := s.eng.Create("agent.ollama.pull", modelName, func(ctx context.Context, log tasks.LogFunc) error {
		return s.agents.PullOllamaModel(ctx, log, modelName)
	})
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"task":    task,
		"model":   modelName,
		"success": true,
	})
}
