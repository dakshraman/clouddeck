package agents

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ChatMessage represents a turn in the chat dialog.
type ChatMessage struct {
	Role    string `json:"role"` // "user" | "assistant" | "system"
	Content string `json:"content"`
}

// ChatRequest holds user prompt and conversation history.
type ChatRequest struct {
	Prompt  string        `json:"prompt"`
	History []ChatMessage `json:"history,omitempty"`
}

// ChatResponse holds assistant reply and model used.
type ChatResponse struct {
	Reply     string   `json:"reply"`
	Model     string   `json:"model"`
	Provider  string   `json:"provider"`
	Actions   []string `json:"actions,omitempty"`
	Timestamp string   `json:"timestamp"`
}

// Chat handles interactive queries about the server, sites, and debugging.
func (m *Manager) Chat(ctx context.Context, req ChatRequest, serverContext string) (ChatResponse, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return ChatResponse{}, fmt.Errorf("prompt is required")
	}

	// 1. Check Anthropic
	if key := m.Vault.GetRawKey("ANTHROPIC_API_KEY"); key != "" {
		reply, err := callAnthropic(ctx, key, prompt, req.History, serverContext)
		if err == nil && reply != "" {
			return ChatResponse{
				Reply:     reply,
				Model:     "claude-3-5-sonnet",
				Provider:  "anthropic",
				Timestamp: time.Now().Format(time.RFC3339),
			}, nil
		}
	}

	// 2. Check OpenAI
	if key := m.Vault.GetRawKey("OPENAI_API_KEY"); key != "" {
		reply, err := callOpenAI(ctx, key, prompt, req.History, serverContext)
		if err == nil && reply != "" {
			return ChatResponse{
				Reply:     reply,
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				Timestamp: time.Now().Format(time.RFC3339),
			}, nil
		}
	}

	// 3. Check DeepSeek
	if key := m.Vault.GetRawKey("DEEPSEEK_API_KEY"); key != "" {
		reply, err := callDeepSeek(ctx, key, prompt, req.History, serverContext)
		if err == nil && reply != "" {
			return ChatResponse{
				Reply:     reply,
				Model:     "deepseek-chat",
				Provider:  "deepseek",
				Timestamp: time.Now().Format(time.RFC3339),
			}, nil
		}
	}

	// 4. Check Local Ollama
	ollamaHost := m.Vault.GetRawKey("OLLAMA_HOST")
	if ollamaHost == "" {
		ollamaHost = "http://127.0.0.1:11434"
	}
	reply, err := callOllama(ctx, ollamaHost, prompt, serverContext)
	if err == nil && reply != "" {
		return ChatResponse{
			Reply:     reply,
			Model:     "ollama-local",
			Provider:  "ollama",
			Timestamp: time.Now().Format(time.RFC3339),
		}, nil
	}

	// 5. Intelligent Fallback (Heuristic Server Engine)
	reply = generateHeuristicReply(prompt, serverContext)
	return ChatResponse{
		Reply:     reply,
		Model:     "clouddeck-heuristics",
		Provider:  "clouddeck-offline",
		Timestamp: time.Now().Format(time.RFC3339),
	}, nil
}

func callAnthropic(ctx context.Context, key, prompt string, history []ChatMessage, sysCtx string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	var messages []map[string]string
	for _, h := range history {
		if h.Role == "user" || h.Role == "assistant" {
			messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
		}
	}
	messages = append(messages, map[string]string{"role": "user", "content": prompt})

	bodyData, _ := json.Marshal(map[string]any{
		"model":      "claude-3-5-sonnet-20241022",
		"max_tokens": 1024,
		"system":     "You are CloudDeck AI Assistant, an expert Linux sysadmin and full-stack DevOps engineer managing this CloudDeck server.\n" + sysCtx,
		"messages":   messages,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyData))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("x-api-key", key)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Content) == 0 {
		return "", fmt.Errorf("anthropic decode failed")
	}
	return result.Content[0].Text, nil
}

func callOpenAI(ctx context.Context, key, prompt string, history []ChatMessage, sysCtx string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	messages := []map[string]string{
		{"role": "system", "content": "You are CloudDeck AI Assistant, an expert Linux sysadmin managing this CloudDeck server.\n" + sysCtx},
	}
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": prompt})

	bodyData, _ := json.Marshal(map[string]any{
		"model":      "gpt-4o-mini",
		"max_tokens": 1024,
		"messages":   messages,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyData))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+key)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Choices) == 0 {
		return "", fmt.Errorf("openai decode failed")
	}
	return result.Choices[0].Message.Content, nil
}

func callDeepSeek(ctx context.Context, key, prompt string, history []ChatMessage, sysCtx string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	messages := []map[string]string{
		{"role": "system", "content": "You are CloudDeck AI Assistant, an expert Linux sysadmin.\n" + sysCtx},
	}
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": prompt})

	bodyData, _ := json.Marshal(map[string]any{
		"model":      "deepseek-chat",
		"max_tokens": 1024,
		"messages":   messages,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.deepseek.com/chat/completions", bytes.NewReader(bodyData))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+key)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Choices) == 0 {
		return "", fmt.Errorf("deepseek decode failed")
	}
	return result.Choices[0].Message.Content, nil
}

func callOllama(ctx context.Context, host, prompt, sysCtx string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	bodyData, _ := json.Marshal(map[string]any{
		"model":  "qwen2.5-coder:1.5b",
		"prompt": prompt,
		"system": "You are CloudDeck AI Assistant.\n" + sysCtx,
		"stream": false,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", host+"/api/generate", bytes.NewReader(bodyData))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || result.Response == "" {
		return "", fmt.Errorf("ollama response empty")
	}
	return result.Response, nil
}

func generateHeuristicReply(prompt, sysCtx string) string {
	lower := strings.ToLower(prompt)
	if strings.Contains(lower, "ram") || strings.Contains(lower, "memory") {
		return "### Server Memory Analysis\n\nTo inspect what processes are using RAM on your server:\n1. Check the **Monitoring** tab in CloudDeck.\n2. In the Terminal, run:\n```bash\nps aux --sort=-%mem | head -n 10\n```\nTo free up cached memory safely:\n```bash\nsync && echo 3 > /proc/sys/vm/drop_caches\n```"
	}
	if strings.Contains(lower, "disk") || strings.Contains(lower, "space") {
		return "### Disk Space Diagnostics\n\nTo locate large files and clean disk space:\n1. Check filesystem free space:\n```bash\ndf -h /\n```\n2. Find top 10 largest folders:\n```bash\ndu -h /var /home 2>/dev/null | sort -rh | head -n 10\n```\n3. Clean apt cache and journal logs:\n```bash\napt-get clean && journalctl --vacuum-time=3d\n```"
	}
	if strings.Contains(lower, "500") || strings.Contains(lower, "502") || strings.Contains(lower, "error") {
		return "### Web Server Error Diagnosis\n\nFor 500 or 502 Bad Gateway errors:\n1. Use **Site Doctor** on your site page to auto-diagnose and fix permissions or database sockets.\n2. Check recent Nginx and PHP error logs:\n```bash\ntail -n 30 /var/log/nginx/error.log\n```\n3. Restart the PHP-FPM socket:\n```bash\nsystemctl restart php8.3-fpm\n```"
	}
	return fmt.Sprintf("### CloudDeck Server Assistant\n\nI analyzed your query: *\"%s\"*.\n\nHere are recommended server management actions:\n- Inspect **Sites** to verify vhost configurations and PHP runtime versions.\n- Check **Monitoring** for real-time CPU, RAM, and disk utilization.\n- Run **Site Doctor** or open the **Web Terminal** to execute maintenance tasks.\n\n> **Tip**: Configure your `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or local `OLLAMA` in the **AI Agents Vault** for conversational reasoning.", prompt)
}
