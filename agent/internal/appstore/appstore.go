package appstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/sites"
)

// AppTemplate defines an installable containerized application stack.
type AppTemplate struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Category    string            `json:"category"`
	Description string            `json:"description"`
	Icon        string            `json:"icon"`
	DefaultPort int               `json:"defaultPort"`
	EnvVars     map[string]string `json:"envVars"`
	ComposeYAML string            `json:"composeYaml"`
}

// InstalledApp represents an active application deployed from the catalog.
type InstalledApp struct {
	ID          string            `json:"id"`
	TemplateID  string            `json:"templateId"`
	Name        string            `json:"name"`
	Domain      string            `json:"domain"`
	Port        int               `json:"port"`
	Status      string            `json:"status"` // "running", "stopped", "error"
	EnvVars     map[string]string `json:"envVars"`
	AppDir      string            `json:"appDir"`
	InstalledAt time.Time         `json:"installedAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

// InstallAppInput specifies creation parameters for a catalog app.
type InstallAppInput struct {
	TemplateID string            `json:"templateId"`
	Name       string            `json:"name,omitempty"`
	Domain     string            `json:"domain"`
	Port       int               `json:"port,omitempty"`
	EnvVars    map[string]string `json:"envVars,omitempty"`
}

// AppActionResult reports the status of an app container action.
type AppActionResult struct {
	ID      string `json:"id"`
	Action  string `json:"action"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

// Service manages the App Store catalog and Docker Compose orchestrations.
type Service struct {
	cfg       config.Config
	sites     *sites.Service
	audit     *audit.Log
	mu        sync.RWMutex
	installed map[string]InstalledApp
}

const installedAppsFile = "installed_apps.json"

// New creates an App Store Service and loads installed applications.
func New(cfg config.Config, siteSvc *sites.Service, auditLog *audit.Log) *Service {
	s := &Service{
		cfg:       cfg,
		sites:     siteSvc,
		audit:     auditLog,
		installed: make(map[string]InstalledApp),
	}
	s.load()
	return s
}

func (s *Service) dataPath() string {
	return filepath.Join(s.cfg.StateDir, installedAppsFile)
}

func (s *Service) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.dataPath())
	if err == nil {
		var list []InstalledApp
		if err := json.Unmarshal(data, &list); err == nil {
			for _, app := range list {
				s.installed[app.ID] = app
			}
		}
	}
}

func (s *Service) saveUnlocked() error {
	list := make([]InstalledApp, 0, len(s.installed))
	for _, app := range s.installed {
		list = append(list, app)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.dataPath(), data, 0o644)
}

// GetCatalog returns the curated production stack catalog.
func (s *Service) GetCatalog() []AppTemplate {
	return []AppTemplate{
		{
			ID:          "ghost",
			Name:        "Ghost CMS",
			Category:    "Publishing",
			Description: "Modern professional publishing platform and newsletter engine.",
			Icon:        "ghost",
			DefaultPort: 2368,
			EnvVars: map[string]string{
				"url": "http://localhost:2368",
			},
			ComposeYAML: `version: '3.8'
services:
  ghost:
    image: ghost:5-alpine
    restart: always
    ports:
      - "{{.Port}}:2368"
    environment:
      url: http://{{.Domain}}
      NODE_ENV: production
    volumes:
      - ./content:/var/lib/ghost/content
`,
		},
		{
			ID:          "plausible",
			Name:        "Plausible Analytics",
			Category:    "Analytics",
			Description: "Lightweight, privacy-friendly Google Analytics alternative.",
			Icon:        "bar-chart-2",
			DefaultPort: 8000,
			EnvVars: map[string]string{
				"BASE_URL":        "http://localhost:8000",
				"SECRET_KEY_BASE": "change_me_to_a_random_hash",
			},
			ComposeYAML: `version: '3.8'
services:
  plausible:
    image: plausible/analytics:latest
    restart: always
    ports:
      - "{{.Port}}:8000"
    environment:
      BASE_URL: http://{{.Domain}}
      SECRET_KEY_BASE: {{.SecretKey}}
`,
		},
		{
			ID:          "umami",
			Name:        "Umami Analytics",
			Category:    "Analytics",
			Description: "Simple, fast, privacy-focused open source alternative to Google Analytics.",
			Icon:        "pie-chart",
			DefaultPort: 3000,
			EnvVars: map[string]string{
				"APP_SECRET": "replace_with_random_key",
			},
			ComposeYAML: `version: '3.8'
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    restart: always
    ports:
      - "{{.Port}}:3000"
    environment:
      APP_SECRET: {{.SecretKey}}
`,
		},
		{
			ID:          "n8n",
			Name:        "n8n Automation",
			Category:    "Automation",
			Description: "Fair-code workflow automation tool with extensive API integrations.",
			Icon:        "git-merge",
			DefaultPort: 5678,
			EnvVars: map[string]string{
				"N8N_HOST":     "localhost",
				"N8N_PORT":     "5678",
				"N8N_PROTOCOL": "http",
			},
			ComposeYAML: `version: '3.8'
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    restart: always
    ports:
      - "{{.Port}}:5678"
    environment:
      - N8N_HOST={{.Domain}}
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://{{.Domain}}/
    volumes:
      - ./data:/home/node/.n8n
`,
		},
		{
			ID:          "minio",
			Name:        "MinIO Object Storage",
			Category:    "Storage",
			Description: "High-performance S3-compatible cloud object storage server.",
			Icon:        "hard-drive",
			DefaultPort: 9000,
			EnvVars: map[string]string{
				"MINIO_ROOT_USER":     "admin",
				"MINIO_ROOT_PASSWORD": "password1234",
			},
			ComposeYAML: `version: '3.8'
services:
  minio:
    image: quay.io/minio/minio
    restart: always
    command: server /data --console-address ":9001"
    ports:
      - "{{.Port}}:9000"
    environment:
      MINIO_ROOT_USER: {{.Env_MINIO_ROOT_USER}}
      MINIO_ROOT_PASSWORD: {{.Env_MINIO_ROOT_PASSWORD}}
    volumes:
      - ./data:/data
`,
		},
		{
			ID:          "vaultwarden",
			Name:        "Vaultwarden",
			Category:    "Security",
			Description: "Unofficial Bitwarden compatible server written in Rust, lightweight and fast.",
			Icon:        "shield-alert",
			DefaultPort: 8085,
			EnvVars: map[string]string{
				"SIGNUPS_ALLOWED": "true",
			},
			ComposeYAML: `version: '3.8'
services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: always
    ports:
      - "{{.Port}}:80"
    environment:
      - SIGNUPS_ALLOWED={{.Env_SIGNUPS_ALLOWED}}
    volumes:
      - ./vw-data:/data
`,
		},
		{
			ID:          "meilisearch",
			Name:        "Meilisearch",
			Category:    "Search",
			Description: "Lightning-fast, hyper-relevant search engine for apps and websites.",
			Icon:        "search",
			DefaultPort: 7700,
			EnvVars: map[string]string{
				"MEILI_MASTER_KEY": "masterKeySecret123",
			},
			ComposeYAML: `version: '3.8'
services:
  meilisearch:
    image: getmeili/meilisearch:v1.7
    restart: always
    ports:
      - "{{.Port}}:7700"
    environment:
      - MEILI_MASTER_KEY={{.SecretKey}}
    volumes:
      - ./data.ms:/meili_data
`,
		},
		{
			ID:          "nextcloud",
			Name:        "Nextcloud Hub",
			Category:    "Collaboration",
			Description: "Self-hosted productivity platform for files, calendars, and contacts.",
			Icon:        "folder",
			DefaultPort: 8086,
			EnvVars: map[string]string{
				"NEXTCLOUD_ADMIN_USER":     "admin",
				"NEXTCLOUD_ADMIN_PASSWORD": "adminPassword123",
			},
			ComposeYAML: `version: '3.8'
services:
  nextcloud:
    image: nextcloud:apache
    restart: always
    ports:
      - "{{.Port}}:80"
    volumes:
      - ./html:/var/www/html
`,
		},
	}
}

// GetTemplate retrieves a catalog entry by ID.
func (s *Service) GetTemplate(id string) (AppTemplate, error) {
	for _, t := range s.GetCatalog() {
		if t.ID == id {
			return t, nil
		}
	}
	return AppTemplate{}, apierr.NotFound("template_not_found", fmt.Sprintf("app template %q not found", id))
}

// ListInstalled returns all active deployed applications.
func (s *Service) ListInstalled() []InstalledApp {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make([]InstalledApp, 0, len(s.installed))
	for _, app := range s.installed {
		res = append(res, app)
	}
	return res
}

// GetInstalled retrieves a single installed app by ID.
func (s *Service) GetInstalled(id string) (InstalledApp, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	app, ok := s.installed[id]
	if !ok {
		return InstalledApp{}, apierr.NotFound("app_not_found", fmt.Sprintf("installed app %q not found", id))
	}
	return app, nil
}

// Install deploys a new containerized application stack.
func (s *Service) Install(ctx context.Context, in InstallAppInput) (InstalledApp, error) {
	tmpl, err := s.GetTemplate(in.TemplateID)
	if err != nil {
		return InstalledApp{}, err
	}

	domain := strings.TrimSpace(in.Domain)
	if domain == "" {
		return InstalledApp{}, apierr.BadRequest("missing_domain", "domain is required for application routing")
	}

	port := in.Port
	if port <= 0 {
		port = tmpl.DefaultPort
	}

	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = tmpl.Name
	}

	appID := fmt.Sprintf("app_%s_%s", tmpl.ID, randomHex(4))
	appDir := filepath.Join(s.cfg.StateDir, "appstore", appID)
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return InstalledApp{}, apierr.Internal("failed to create app dir: " + err.Error())
	}

	// Prepare environment and substitutions
	envVars := make(map[string]string)
	for k, v := range tmpl.EnvVars {
		envVars[k] = v
	}
	for k, v := range in.EnvVars {
		envVars[k] = v
	}

	secretKey := randomHex(24)

	compose := tmpl.ComposeYAML
	compose = strings.ReplaceAll(compose, "{{.Port}}", fmt.Sprintf("%d", port))
	compose = strings.ReplaceAll(compose, "{{.Domain}}", domain)
	compose = strings.ReplaceAll(compose, "{{.SecretKey}}", secretKey)

	for k, v := range envVars {
		compose = strings.ReplaceAll(compose, "{{.Env_"+k+"}}", v)
	}

	composePath := filepath.Join(appDir, "docker-compose.yml")
	if err := os.WriteFile(composePath, []byte(compose), 0o644); err != nil {
		return InstalledApp{}, apierr.Internal("failed to write compose file: " + err.Error())
	}

	// Write .env
	var envLines []string
	envLines = append(envLines, fmt.Sprintf("APP_ID=%s", appID))
	envLines = append(envLines, fmt.Sprintf("APP_DOMAIN=%s", domain))
	envLines = append(envLines, fmt.Sprintf("APP_PORT=%d", port))
	for k, v := range envVars {
		envLines = append(envLines, fmt.Sprintf("%s=%s", k, v))
	}
	_ = os.WriteFile(filepath.Join(appDir, ".env"), []byte(strings.Join(envLines, "\n")), 0o600)

	// In non-dry-run mode, invoke docker compose
	if !s.cfg.DryRun {
		cmd := exec.CommandContext(ctx, "docker", "compose", "-f", composePath, "up", "-d")
		cmd.Dir = appDir
		if out, err := cmd.CombinedOutput(); err != nil {
			return InstalledApp{}, apierr.Internal(fmt.Sprintf("docker compose up failed: %v: %s", err, string(out)))
		}
	}

	now := time.Now().UTC()
	app := InstalledApp{
		ID:          appID,
		TemplateID:  tmpl.ID,
		Name:        name,
		Domain:      domain,
		Port:        port,
		Status:      "running",
		EnvVars:     envVars,
		AppDir:      appDir,
		InstalledAt: now,
		UpdatedAt:   now,
	}

	s.mu.Lock()
	s.installed[appID] = app
	_ = s.saveUnlocked()
	s.mu.Unlock()

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "appstore.install",
			Params: map[string]any{"id": appID, "template": tmpl.ID, "domain": domain, "port": port},
			Result: audit.ResultAccepted,
		})
	}

	return app, nil
}

// Action triggers a lifecycle operation on an installed app (start, stop, restart, upgrade).
func (s *Service) Action(ctx context.Context, id string, action string) (AppActionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	app, ok := s.installed[id]
	if !ok {
		return AppActionResult{}, apierr.NotFound("app_not_found", fmt.Sprintf("app %q not found", id))
	}

	action = strings.ToLower(strings.TrimSpace(action))
	newStatus := app.Status

	switch action {
	case "start":
		newStatus = "running"
		if !s.cfg.DryRun {
			_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "start").Run()
		}
	case "stop":
		newStatus = "stopped"
		if !s.cfg.DryRun {
			_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "stop").Run()
		}
	case "restart":
		newStatus = "running"
		if !s.cfg.DryRun {
			_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "restart").Run()
		}
	case "upgrade":
		newStatus = "running"
		if !s.cfg.DryRun {
			_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "pull").Run()
			_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "up", "-d").Run()
		}
	default:
		return AppActionResult{}, apierr.BadRequest("invalid_action", fmt.Sprintf("unsupported action %q", action))
	}

	app.Status = newStatus
	app.UpdatedAt = time.Now().UTC()
	s.installed[id] = app
	_ = s.saveUnlocked()

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "appstore.action",
			Params: map[string]any{"id": id, "action": action},
			Result: audit.ResultAccepted,
		})
	}

	return AppActionResult{
		ID:      id,
		Action:  action,
		Status:  newStatus,
		Message: fmt.Sprintf("App %s action %q completed successfully", app.Name, action),
	}, nil
}

// Uninstall terminates the app container stack and cleans up data.
func (s *Service) Uninstall(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	app, ok := s.installed[id]
	if !ok {
		return apierr.NotFound("app_not_found", fmt.Sprintf("app %q not found", id))
	}

	if !s.cfg.DryRun {
		_ = exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "down", "-v").Run()
	}

	_ = os.RemoveAll(app.AppDir)
	delete(s.installed, id)
	_ = s.saveUnlocked()

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "appstore.uninstall",
			Params: map[string]any{"id": id},
			Result: audit.ResultAccepted,
		})
	}

	return nil
}

// GetLogs returns the stdout/stderr logs from the container stack.
func (s *Service) GetLogs(ctx context.Context, id string, tail int) (string, error) {
	s.mu.RLock()
	app, ok := s.installed[id]
	s.mu.RUnlock()

	if !ok {
		return "", apierr.NotFound("app_not_found", fmt.Sprintf("app %q not found", id))
	}

	if tail <= 0 {
		tail = 100
	}

	if s.cfg.DryRun {
		timestamp := time.Now().UTC().Format(time.RFC3339)
		return fmt.Sprintf("[%s] [info] Container stack %s started successfully\n[%s] [info] Server listening on port %d\n",
			timestamp, app.Name, timestamp, app.Port), nil
	}

	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(app.AppDir, "docker-compose.yml"), "logs", fmt.Sprintf("--tail=%d", tail))
	cmd.Dir = app.AppDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("read logs: %w", err)
	}
	return string(out), nil
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
