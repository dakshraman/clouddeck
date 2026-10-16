// Package store keeps agent state in memory and persists it to JSON files
// with atomic writes. It is the single source of truth for sites and tasks.
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Site statuses.
const (
	SiteActive       = "active"
	SiteProvisioning = "provisioning"
	SiteError        = "error"
)

// Task statuses.
const (
	TaskPending   = "pending"
	TaskRunning   = "running"
	TaskSucceeded = "succeeded"
	TaskFailed    = "failed"
)

const (
	maxTasks   = 200
	maxTaskLog = 500
)

var (
	// ErrExists is returned when creating a site whose domain is taken.
	ErrExists = errors.New("already exists")
	// ErrNotFound is returned when a site or task is missing.
	ErrNotFound = errors.New("not found")
)

// SSL describes a site's certificate state.
type SSL struct {
	Enabled   bool   `json:"enabled"`
	Issuer    string `json:"issuer,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
}

// Site is a hosted site.
type Site struct {
	Domain     string    `json:"domain"`
	Root       string    `json:"root"`
	PHPVersion string    `json:"phpVersion"`
	SSL        SSL       `json:"ssl"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// LogEntry is one task log line.
type LogEntry struct {
	At      time.Time `json:"at"`
	Level   string    `json:"level"`
	Message string    `json:"message"`
}

// Task is one asynchronous agent operation.
type Task struct {
	ID         string     `json:"id"`
	Type       string     `json:"type"`
	Site       string     `json:"site"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"createdAt"`
	StartedAt  *time.Time `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt"`
	Logs       []LogEntry `json:"logs"`
	Error      *string    `json:"error"`
}

// Now is the canonical timestamp: UTC truncated to seconds so JSON output is
// exactly RFC3339.
func Now() time.Time {
	return time.Now().UTC().Truncate(time.Second)
}

// Store is the agent's persistent state.
type Store struct {
	mu    sync.Mutex
	dir   string
	sites map[string]Site
	tasks []Task // newest first
}

type stateFile struct {
	Sites []Site `json:"sites"`
}

type tasksFile struct {
	Tasks []Task `json:"tasks"`
}

// Open loads state.json and tasks.json from dir, creating dir if needed.
func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create state dir: %w", err)
	}
	s := &Store{dir: dir, sites: make(map[string]Site)}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	var state stateFile
	if err := readJSON(filepath.Join(s.dir, "state.json"), &state); err != nil {
		return fmt.Errorf("load state.json: %w", err)
	}
	for _, site := range state.Sites {
		s.sites[site.Domain] = site
	}
	var tasks tasksFile
	if err := readJSON(filepath.Join(s.dir, "tasks.json"), &tasks); err != nil {
		return fmt.Errorf("load tasks.json: %w", err)
	}
	s.tasks = tasks.Tasks
	if s.tasks == nil {
		s.tasks = []Task{}
	}
	return nil
}

// ListSites returns every site, sorted by domain.
func (s *Store) ListSites() []Site {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Site, 0, len(s.sites))
	for _, site := range s.sites {
		out = append(out, site)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Domain < out[j].Domain })
	return out
}

// GetSite returns the site for domain.
func (s *Store) GetSite(domain string) (Site, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	site, ok := s.sites[domain]
	return site, ok
}

// CreateSite persists a new site; it fails with ErrExists on duplicates.
func (s *Store) CreateSite(site Site) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sites[site.Domain]; ok {
		return fmt.Errorf("site %q: %w", site.Domain, ErrExists)
	}
	s.sites[site.Domain] = site
	if err := s.saveSites(); err != nil {
		delete(s.sites, site.Domain)
		return err
	}
	return nil
}

// UpdateSite mutates a site in place and persists the result.
func (s *Store) UpdateSite(domain string, mutate func(*Site)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	site, ok := s.sites[domain]
	if !ok {
		return fmt.Errorf("site %q: %w", domain, ErrNotFound)
	}
	mutate(&site)
	s.sites[domain] = site
	return s.saveSites()
}

// DeleteSite removes a site and persists the result.
func (s *Store) DeleteSite(domain string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.sites[domain]; !ok {
		return fmt.Errorf("site %q: %w", domain, ErrNotFound)
	}
	delete(s.sites, domain)
	return s.saveSites()
}

// ListTasks returns tasks newest first.
func (s *Store) ListTasks() []Task {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Task, 0, len(s.tasks))
	for _, task := range s.tasks {
		out = append(out, cloneTask(task))
	}
	return out
}

// GetTask returns one task including its logs.
func (s *Store) GetTask(id string) (Task, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, task := range s.tasks {
		if task.ID == id {
			return cloneTask(task), true
		}
	}
	return Task{}, false
}

// AddTask stores a new task, keeping only the newest maxTasks.
func (s *Store) AddTask(task Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if task.Logs == nil {
		task.Logs = []LogEntry{}
	}
	s.tasks = append([]Task{task}, s.tasks...)
	if len(s.tasks) > maxTasks {
		s.tasks = s.tasks[:maxTasks]
	}
	return s.saveTasks()
}

// UpdateTask mutates a task in place and persists the result.
func (s *Store) UpdateTask(id string, mutate func(*Task)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.tasks {
		if s.tasks[i].ID == id {
			mutate(&s.tasks[i])
			return s.saveTasks()
		}
	}
	return fmt.Errorf("task %q: %w", id, ErrNotFound)
}

// AppendTaskLog adds one log line to a task, capping logs at maxTaskLog.
func (s *Store) AppendTaskLog(id string, entry LogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.tasks {
		if s.tasks[i].ID == id {
			logs := s.tasks[i].Logs
			if len(logs) >= maxTaskLog {
				logs = logs[len(logs)-maxTaskLog+1:]
			}
			s.tasks[i].Logs = append(logs, entry)
			return s.saveTasks()
		}
	}
	return fmt.Errorf("task %q: %w", id, ErrNotFound)
}

func (s *Store) saveSites() error {
	sites := make([]Site, 0, len(s.sites))
	for _, site := range s.sites {
		sites = append(sites, site)
	}
	sort.Slice(sites, func(i, j int) bool { return sites[i].Domain < sites[j].Domain })
	data, err := json.MarshalIndent(stateFile{Sites: sites}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode state.json: %w", err)
	}
	if err := writeFileAtomic(filepath.Join(s.dir, "state.json"), data, 0o600); err != nil {
		return fmt.Errorf("write state.json: %w", err)
	}
	return nil
}

func (s *Store) saveTasks() error {
	data, err := json.MarshalIndent(tasksFile{Tasks: s.tasks}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode tasks.json: %w", err)
	}
	if err := writeFileAtomic(filepath.Join(s.dir, "tasks.json"), data, 0o600); err != nil {
		return fmt.Errorf("write tasks.json: %w", err)
	}
	return nil
}

func cloneTask(t Task) Task {
	t.Logs = append([]LogEntry{}, t.Logs...)
	return t
}

func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
