package alerts

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// TelegramConfig settings.
type TelegramConfig struct {
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"botToken"`
	ChatID   string `json:"chatId"`
}

// DiscordConfig settings.
type DiscordConfig struct {
	Enabled    bool   `json:"enabled"`
	WebhookURL string `json:"webhookUrl"`
}

// SlackConfig settings.
type SlackConfig struct {
	Enabled    bool   `json:"enabled"`
	WebhookURL string `json:"webhookUrl"`
}

// WebhookConfig generic webhook settings.
type WebhookConfig struct {
	Enabled bool   `json:"enabled"`
	URL     string `json:"url"`
	Secret  string `json:"secret,omitempty"`
}

// ChannelsConfig groups all notification channels.
type ChannelsConfig struct {
	Telegram TelegramConfig `json:"telegram"`
	Discord  DiscordConfig  `json:"discord"`
	Slack    SlackConfig    `json:"slack"`
	Webhook  WebhookConfig  `json:"webhook"`
}

// ThresholdsConfig alert trigger thresholds.
type ThresholdsConfig struct {
	CPUPercent  int  `json:"cpuPercent"`
	RAMPercent  int  `json:"ramPercent"`
	DiskPercent int  `json:"diskPercent"`
	ServiceDown bool `json:"serviceDown"`
}

// Config stores all alerting preferences and secrets.
type Config struct {
	Enabled         bool             `json:"enabled"`
	CooldownMinutes int              `json:"cooldownMinutes"`
	Thresholds      ThresholdsConfig `json:"thresholds"`
	Channels        ChannelsConfig   `json:"channels"`
	UpdatedAt       time.Time        `json:"updatedAt"`
}

// DefaultConfig returns healthy sensible defaults.
func DefaultConfig() Config {
	return Config{
		Enabled:         true,
		CooldownMinutes: 15,
		Thresholds: ThresholdsConfig{
			CPUPercent:  85,
			RAMPercent:  90,
			DiskPercent: 90,
			ServiceDown: true,
		},
		Channels: ChannelsConfig{},
	}
}

// Alert represents an emitted incident notification.
type Alert struct {
	Type      string         `json:"type"`     // "cpu" | "ram" | "disk" | "service" | "test"
	Severity  string         `json:"severity"` // "critical" | "warning" | "info"
	Title     string         `json:"title"`
	Message   string         `json:"message"`
	Metrics   map[string]any `json:"metrics,omitempty"`
	Timestamp time.Time      `json:"timestamp"`
}

// Service manages alerting channels, evaluations, and cooldowns.
type Service struct {
	cfg        config.Config
	audit      *audit.Log
	mu         sync.RWMutex
	alertConf  Config
	filePath   string
	lastSent   map[string]time.Time
	httpClient *http.Client
}

// New creates an Alerts manager and loads persisted config.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	filePath := filepath.Join(cfg.StateDir, "alerts.json")
	if cfg.StateDir == "" {
		filePath = "data/alerts.json"
	}

	s := &Service{
		cfg:        cfg,
		audit:      auditLog,
		filePath:   filePath,
		alertConf:  DefaultConfig(),
		lastSent:   make(map[string]time.Time),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
	_ = s.load()
	return s
}

func (s *Service) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}
	var conf Config
	if err := json.Unmarshal(data, &conf); err != nil {
		return err
	}
	s.alertConf = conf
	return nil
}

func (s *Service) save() error {
	_ = os.MkdirAll(filepath.Dir(s.filePath), 0o755)
	data, err := json.MarshalIndent(s.alertConf, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0o644)
}

// GetConfig returns the current alert configuration.
func (s *Service) GetConfig() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.alertConf
}

// UpdateConfig updates and persists alert settings.
func (s *Service) UpdateConfig(ctx context.Context, conf Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if conf.CooldownMinutes <= 0 {
		conf.CooldownMinutes = 15
	}
	if conf.Thresholds.CPUPercent <= 0 {
		conf.Thresholds.CPUPercent = 85
	}
	if conf.Thresholds.RAMPercent <= 0 {
		conf.Thresholds.RAMPercent = 90
	}
	if conf.Thresholds.DiskPercent <= 0 {
		conf.Thresholds.DiskPercent = 90
	}
	conf.UpdatedAt = time.Now()

	s.alertConf = conf
	if err := s.save(); err != nil {
		return fmt.Errorf("save alerts config: %w", err)
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "alerts.config.update",
			Params: map[string]any{"enabled": conf.Enabled},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}

// Dispatch sends an alert to all configured channels respecting cooldowns.
func (s *Service) Dispatch(ctx context.Context, alert Alert) map[string]string {
	s.mu.Lock()
	conf := s.alertConf
	cooldown := time.Duration(conf.CooldownMinutes) * time.Minute
	if cooldown <= 0 {
		cooldown = 15 * time.Minute
	}

	// Check cooldown unless it's a test
	if alert.Type != "test" {
		if last, ok := s.lastSent[alert.Type]; ok && time.Since(last) < cooldown {
			s.mu.Unlock()
			return map[string]string{"status": "suppressed_by_cooldown"}
		}
		s.lastSent[alert.Type] = time.Now()
	}
	s.mu.Unlock()

	results := make(map[string]string)

	if !conf.Enabled && alert.Type != "test" {
		results["status"] = "alerts_disabled"
		return results
	}

	// 1. Telegram
	if conf.Channels.Telegram.Enabled && conf.Channels.Telegram.BotToken != "" && conf.Channels.Telegram.ChatID != "" {
		if err := s.sendTelegram(ctx, conf.Channels.Telegram, alert); err != nil {
			results["telegram"] = "error: " + err.Error()
		} else {
			results["telegram"] = "sent"
		}
	} else {
		results["telegram"] = "disabled"
	}

	// 2. Discord
	if conf.Channels.Discord.Enabled && conf.Channels.Discord.WebhookURL != "" {
		if err := s.sendDiscord(ctx, conf.Channels.Discord, alert); err != nil {
			results["discord"] = "error: " + err.Error()
		} else {
			results["discord"] = "sent"
		}
	} else {
		results["discord"] = "disabled"
	}

	// 3. Slack
	if conf.Channels.Slack.Enabled && conf.Channels.Slack.WebhookURL != "" {
		if err := s.sendSlack(ctx, conf.Channels.Slack, alert); err != nil {
			results["slack"] = "error: " + err.Error()
		} else {
			results["slack"] = "sent"
		}
	} else {
		results["slack"] = "disabled"
	}

	// 4. Webhook
	if conf.Channels.Webhook.Enabled && conf.Channels.Webhook.URL != "" {
		if err := s.sendWebhook(ctx, conf.Channels.Webhook, alert); err != nil {
			results["webhook"] = "error: " + err.Error()
		} else {
			results["webhook"] = "sent"
		}
	} else {
		results["webhook"] = "disabled"
	}

	return results
}

// Test sends a sample test notification across one or all channels.
func (s *Service) Test(ctx context.Context, targetChannel string) (map[string]string, error) {
	alert := Alert{
		Type:      "test",
		Severity:  "info",
		Title:     "CloudDeck Test Alert",
		Message:   "This is a verification test notification from your CloudDeck server.",
		Timestamp: time.Now(),
		Metrics: map[string]any{
			"status": "healthy",
			"test":   true,
		},
	}

	if s.cfg.DryRun {
		return map[string]string{
			"status":  "dry-run: alert test passed",
			"channel": targetChannel,
		}, nil
	}

	target := strings.ToLower(strings.TrimSpace(targetChannel))
	if target == "" || target == "all" {
		res := s.Dispatch(ctx, alert)
		return res, nil
	}

	conf := s.GetConfig()
	results := make(map[string]string)

	switch target {
	case "telegram":
		if conf.Channels.Telegram.BotToken != "" && conf.Channels.Telegram.ChatID != "" {
			if err := s.sendTelegram(ctx, conf.Channels.Telegram, alert); err != nil {
				results["telegram"] = "error: " + err.Error()
			} else {
				results["telegram"] = "sent"
			}
		} else {
			results["telegram"] = "error: telegram not configured (missing botToken or chatId)"
		}
	case "discord":
		if conf.Channels.Discord.WebhookURL != "" {
			if err := s.sendDiscord(ctx, conf.Channels.Discord, alert); err != nil {
				results["discord"] = "error: " + err.Error()
			} else {
				results["discord"] = "sent"
			}
		} else {
			results["discord"] = "error: discord webhook url is not configured"
		}
	case "slack":
		if conf.Channels.Slack.WebhookURL != "" {
			if err := s.sendSlack(ctx, conf.Channels.Slack, alert); err != nil {
				results["slack"] = "error: " + err.Error()
			} else {
				results["slack"] = "sent"
			}
		} else {
			results["slack"] = "error: slack webhook url is not configured"
		}
	case "webhook":
		if conf.Channels.Webhook.URL != "" {
			if err := s.sendWebhook(ctx, conf.Channels.Webhook, alert); err != nil {
				results["webhook"] = "error: " + err.Error()
			} else {
				results["webhook"] = "sent"
			}
		} else {
			results["webhook"] = "error: webhook url is not configured"
		}
	default:
		return s.Dispatch(ctx, alert), nil
	}

	return results, nil
}

func (s *Service) sendTelegram(ctx context.Context, tg TelegramConfig, alert Alert) error {
	text := fmt.Sprintf("<b>[CloudDeck Alert] %s</b>\n\n%s\n\n<i>Time: %s</i>",
		alert.Title, alert.Message, alert.Timestamp.Format(time.RFC3339))

	payload, _ := json.Marshal(map[string]any{
		"chat_id":    tg.ChatID,
		"text":       text,
		"parse_mode": "HTML",
	})

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", tg.BotToken)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("telegram returned status %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) sendDiscord(ctx context.Context, dc DiscordConfig, alert Alert) error {
	color := 0x3b82f6 // blue
	if alert.Severity == "critical" {
		color = 0xef4444 // red
	} else if alert.Severity == "warning" {
		color = 0xf59e0b // yellow
	}

	fields := []map[string]any{
		{
			"name":   "Severity",
			"value":  strings.ToUpper(alert.Severity),
			"inline": true,
		},
		{
			"name":   "Type",
			"value":  alert.Type,
			"inline": true,
		},
	}
	if alert.Metrics != nil && len(alert.Metrics) > 0 {
		var metricParts []string
		for k, v := range alert.Metrics {
			metricParts = append(metricParts, fmt.Sprintf("%s: %v", k, v))
		}
		fields = append(fields, map[string]any{
			"name":   "Metrics",
			"value":  strings.Join(metricParts, ", "),
			"inline": false,
		})
	}

	payload, _ := json.Marshal(map[string]any{
		"username": "CloudDeck Alerts",
		"embeds": []map[string]any{
			{
				"title":       alert.Title,
				"description": alert.Message,
				"color":       color,
				"fields":      fields,
				"timestamp":   alert.Timestamp.Format(time.RFC3339),
				"footer": map[string]any{
					"text": "CloudDeck Alert System",
				},
			},
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", dc.WebhookURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord returned status %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) sendSlack(ctx context.Context, sc SlackConfig, alert Alert) error {
	emoji := "ℹ️"
	if alert.Severity == "critical" {
		emoji = "🚨"
	} else if alert.Severity == "warning" {
		emoji = "⚠️"
	}

	headerText := fmt.Sprintf("%s %s", emoji, alert.Title)
	fields := []map[string]any{
		{
			"type": "mrkdwn",
			"text": fmt.Sprintf("*Severity:*\n%s", strings.ToUpper(alert.Severity)),
		},
		{
			"type": "mrkdwn",
			"text": fmt.Sprintf("*Type:*\n%s", alert.Type),
		},
		{
			"type": "mrkdwn",
			"text": fmt.Sprintf("*Time:*\n%s", alert.Timestamp.Format("2006-01-02 15:04:05 MST")),
		},
	}
	if alert.Metrics != nil && len(alert.Metrics) > 0 {
		var metricParts []string
		for k, v := range alert.Metrics {
			metricParts = append(metricParts, fmt.Sprintf("%s: %v", k, v))
		}
		fields = append(fields, map[string]any{
			"type": "mrkdwn",
			"text": fmt.Sprintf("*Metrics:*\n%s", strings.Join(metricParts, ", ")),
		})
	}

	blocks := []map[string]any{
		{
			"type": "header",
			"text": map[string]any{
				"type":  "plain_text",
				"text":  headerText,
				"emoji": true,
			},
		},
		{
			"type": "section",
			"text": map[string]any{
				"type": "mrkdwn",
				"text": alert.Message,
			},
		},
		{
			"type":   "section",
			"fields": fields,
		},
	}

	payload, _ := json.Marshal(map[string]any{
		"text":   fmt.Sprintf("[%s] %s: %s", strings.ToUpper(alert.Severity), alert.Title, alert.Message),
		"blocks": blocks,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", sc.WebhookURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("slack returned status %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) sendWebhook(ctx context.Context, wh WebhookConfig, alert Alert) error {
	payload, err := json.Marshal(alert)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", wh.URL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "CloudDeck-Alerts/1.0")

	if wh.Secret != "" {
		mac := hmac.New(sha256.New, []byte(wh.Secret))
		mac.Write(payload)
		sig := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-CloudDeck-Signature", sig)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}
	return nil
}
