// Package store: application workloads and firewall rules.
package store

import (
	"fmt"
	"sort"
	"time"
)

// App is a supervised application workload owned by a site (v0.6).
type App struct {
	ID          string            `json:"id"`
	Site        string            `json:"site"`
	Name        string            `json:"name"`
	Kind        string            `json:"kind"`
	Version     string            `json:"version,omitempty"`
	Bin         string            `json:"bin,omitempty"`
	Command     string            `json:"command"`
	Dir         string            `json:"dir"`
	Port        int               `json:"port"`
	Env         map[string]string `json:"env,omitempty"`
	HealthPath  string            `json:"healthPath,omitempty"`
	RunAs       string            `json:"runAs,omitempty"`
	Supervisor  string            `json:"supervisor,omitempty"`
	AutoRestart bool              `json:"autoRestart"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

// FirewallRule is one managed inbound rule (v0.6).
type FirewallRule struct {
	ID        string    `json:"id"`
	Port      int       `json:"port"`
	Protocol  string    `json:"protocol"` // tcp or udp
	Action    string    `json:"action"`   // allow or deny
	From      string    `json:"from,omitempty"`
	Comment   string    `json:"comment,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// ListApps returns every app, sorted by site then name.
func (s *Store) ListApps() []App {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]App, 0, len(s.apps))
	for _, app := range s.apps {
		out = append(out, app)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Site != out[j].Site {
			return out[i].Site < out[j].Site
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// GetApp returns one app by site and name.
func (s *Store) GetApp(site, name string) (App, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	app, ok := s.apps[appKey(site, name)]
	return app, ok
}

// CreateApp persists a new app.
func (s *Store) CreateApp(app App) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := appKey(app.Site, app.Name)
	if _, ok := s.apps[key]; ok {
		return fmt.Errorf("app %s/%s: %w", app.Site, app.Name, ErrExists)
	}
	s.apps[key] = app
	if err := s.saveApps(); err != nil {
		delete(s.apps, key)
		return err
	}
	return nil
}

// UpdateApp mutates an app in place and persists the result.
func (s *Store) UpdateApp(site, name string, mutate func(*App)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := appKey(site, name)
	app, ok := s.apps[key]
	if !ok {
		return fmt.Errorf("app %s/%s: %w", site, name, ErrNotFound)
	}
	mutate(&app)
	s.apps[key] = app
	return s.saveApps()
}

// DeleteApp removes an app from state.
func (s *Store) DeleteApp(site, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := appKey(site, name)
	if _, ok := s.apps[key]; !ok {
		return fmt.Errorf("app %s/%s: %w", site, name, ErrNotFound)
	}
	delete(s.apps, key)
	return s.saveApps()
}

// ListFirewallRules returns every managed firewall rule.
func (s *Store) ListFirewallRules() []FirewallRule {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]FirewallRule, 0, len(s.firewall))
	for _, rule := range s.firewall {
		out = append(out, rule)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Port != out[j].Port {
			return out[i].Port < out[j].Port
		}
		return out[i].Protocol < out[j].Protocol
	})
	return out
}

// AddFirewallRule persists a rule.
func (s *Store) AddFirewallRule(rule FirewallRule) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.firewall {
		if existing.Port == rule.Port && existing.Protocol == rule.Protocol && existing.Action == rule.Action && existing.From == rule.From {
			return fmt.Errorf("firewall rule %d/%s: %w", rule.Port, rule.Protocol, ErrExists)
		}
	}
	s.firewall[rule.ID] = rule
	if err := s.saveFirewall(); err != nil {
		delete(s.firewall, rule.ID)
		return err
	}
	return nil
}

// DeleteFirewallRule removes a rule by ID.
func (s *Store) DeleteFirewallRule(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.firewall[id]; !ok {
		return fmt.Errorf("firewall rule %s: %w", id, ErrNotFound)
	}
	delete(s.firewall, id)
	return s.saveFirewall()
}

func appKey(site, name string) string {
	return site + "/" + name
}
