package rbac

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

const usersFileName = "users.json"

var validUsernameRe = regexp.MustCompile(`^[a-z0-9_-]{3,32}$`)

// Quotas configures resource limits for client sub-accounts.
type Quotas struct {
	DiskMB       int64 `json:"diskMb"`
	MaxDatabases int   `json:"maxDatabases"`
	MaxMailboxes int   `json:"maxMailboxes"`
}

// User represents an administrative or client sub-account with scoped domain access.
type User struct {
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	Role         string    `json:"role"` // "admin" | "client"
	Domains      []string  `json:"domains"`
	Quotas       Quotas    `json:"quotas"`
	PasswordHash string    `json:"-"`
	Password     string    `json:"password,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Service manages multi-tenant sub-accounts, roles, and quota allocations.
type Service struct {
	cfg   config.Config
	audit *audit.Log
	mu    sync.RWMutex
}

// New creates the RBAC manager.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{
		cfg:   cfg,
		audit: auditLog,
	}
}

func (s *Service) usersPath() string {
	return filepath.Join(s.cfg.StateDir, usersFileName)
}

func (s *Service) readUsersUnlocked() ([]User, error) {
	data, err := os.ReadFile(s.usersPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []User{}, nil
		}
		return nil, err
	}

	var users []User
	if err := json.Unmarshal(data, &users); err != nil {
		return []User{}, nil
	}
	return users, nil
}

func (s *Service) writeUsersUnlocked(users []User) error {
	data, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.usersPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.usersPath())
}

// ListUsers returns all registered user accounts with sensitive passwords omitted.
func (s *Service) ListUsers() ([]User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	users, err := s.readUsersUnlocked()
	if err != nil {
		return nil, err
	}

	sanitized := make([]User, len(users))
	for i, u := range users {
		copy := u
		copy.Password = ""
		copy.PasswordHash = ""
		if copy.Domains == nil {
			copy.Domains = []string{}
		}
		sanitized[i] = copy
	}
	return sanitized, nil
}

// CreateUser provisions a new administrative or scoped client account.
func (s *Service) CreateUser(u User) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u.Username = strings.ToLower(strings.TrimSpace(u.Username))
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	u.Role = strings.ToLower(strings.TrimSpace(u.Role))
	password := strings.TrimSpace(u.Password)

	if !validUsernameRe.MatchString(u.Username) {
		return User{}, apierr.BadRequest("invalid_username", "username must be 3-32 characters of [a-z0-9_-]")
	}
	if u.Role == "" {
		u.Role = "client"
	}
	if u.Role != "admin" && u.Role != "client" {
		return User{}, apierr.BadRequest("invalid_role", "role must be 'admin' or 'client'")
	}
	if password == "" {
		return User{}, apierr.BadRequest("missing_password", "password is required")
	}
	if u.Domains == nil {
		u.Domains = []string{}
	}

	users, err := s.readUsersUnlocked()
	if err != nil {
		return User{}, err
	}

	for _, existing := range users {
		if existing.Username == u.Username {
			return User{}, apierr.Conflict("user_exists", fmt.Sprintf("user %q already exists", u.Username))
		}
	}

	now := time.Now().UTC()
	u.PasswordHash = hashPassword(password)
	u.Password = ""
	u.CreatedAt = now
	u.UpdatedAt = now

	users = append(users, u)
	if err := s.writeUsersUnlocked(users); err != nil {
		return User{}, apierr.Internal("failed to write users: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "rbac.user.create",
			Params: map[string]any{"username": u.Username, "role": u.Role, "domains": u.Domains},
			Result: audit.ResultAccepted,
		})
	}

	copy := u
	copy.PasswordHash = ""
	return copy, nil
}

// UpdateUser updates roles, domains, quotas, or credentials for an existing account.
func (s *Service) UpdateUser(username string, update User) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	username = strings.ToLower(strings.TrimSpace(username))
	users, err := s.readUsersUnlocked()
	if err != nil {
		return User{}, err
	}

	found := false
	var updated User

	for i, existing := range users {
		if existing.Username == username {
			if update.Email != "" {
				existing.Email = strings.ToLower(strings.TrimSpace(update.Email))
			}
			if update.Role != "" {
				role := strings.ToLower(strings.TrimSpace(update.Role))
				if role == "admin" || role == "client" {
					existing.Role = role
				}
			}
			if update.Domains != nil {
				existing.Domains = update.Domains
			}
			if update.Quotas.DiskMB > 0 || update.Quotas.MaxDatabases > 0 || update.Quotas.MaxMailboxes > 0 {
				existing.Quotas = update.Quotas
			}
			if strings.TrimSpace(update.Password) != "" {
				existing.PasswordHash = hashPassword(strings.TrimSpace(update.Password))
			}
			existing.UpdatedAt = time.Now().UTC()
			users[i] = existing
			updated = existing
			found = true
			break
		}
	}

	if !found {
		return User{}, apierr.NotFound("user_not_found", fmt.Sprintf("user %q not found", username))
	}

	if err := s.writeUsersUnlocked(users); err != nil {
		return User{}, apierr.Internal("failed to update users: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "rbac.user.update",
			Params: map[string]any{"username": username, "role": updated.Role},
			Result: audit.ResultAccepted,
		})
	}

	copy := updated
	copy.Password = ""
	copy.PasswordHash = ""
	return copy, nil
}

// DeleteUser deletes an account by username.
func (s *Service) DeleteUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	username = strings.ToLower(strings.TrimSpace(username))
	users, err := s.readUsersUnlocked()
	if err != nil {
		return err
	}

	found := false
	filtered := make([]User, 0, len(users))
	for _, u := range users {
		if u.Username == username {
			found = true
			continue
		}
		filtered = append(filtered, u)
	}

	if !found {
		return apierr.NotFound("user_not_found", fmt.Sprintf("user %q not found", username))
	}

	if err := s.writeUsersUnlocked(filtered); err != nil {
		return apierr.Internal("failed to delete user: " + err.Error())
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "rbac.user.delete",
			Params: map[string]any{"username": username},
			Result: audit.ResultAccepted,
		})
	}
	return nil
}

func hashPassword(plain string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte(plain))
	return hex.EncodeToString(salt) + ":" + hex.EncodeToString(h.Sum(nil))
}
