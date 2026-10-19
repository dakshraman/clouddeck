// Package sshkeys manages SSH authorized keys and generated keypairs.
// See docs/api.md section 1.9.
package sshkeys

import (
	"errors"
	"fmt"
	"io/fs"
	stdlog "log"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
)

// Audit actions owned by the SSH key flows.
const (
	actionKeyAdd       = "ssh.key.add"
	actionKeyDelete    = "ssh.key.delete"
	actionKeygenCreate = "ssh.keygen.create"
	actionKeygenDelete = "ssh.keygen.delete"
)

// Defaults and file modes.
const (
	defaultKeygenBin = "ssh-keygen"
	defaultComment   = "clouddeck"
	keysFilePerm     = 0o600
	keysDirPerm      = 0o700
)

// Key is one authorized_keys entry.
type Key struct {
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment,omitempty"`
	Line        string `json:"line"`
}

// GeneratedKey is one keypair created under AGENT_SSH_KEY_DIR. PrivateKey is
// only populated by Generate and ReadGenerated.
type GeneratedKey struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Comment     string `json:"comment,omitempty"`
	Fingerprint string `json:"fingerprint"`
	PublicKey   string `json:"publicKey"`
	PrivateKey  string `json:"privateKey,omitempty"`
}

// Status is the /v1/ssh/status body.
type Status struct {
	User     string `json:"user"`
	KeysFile string `json:"keysFile"`
	KeyDir   string `json:"keyDir"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname"`
}

// Service coordinates authorized_keys and generated keypairs.
type Service struct {
	cfg   config.Config
	audit *audit.Log

	// mu serializes read-modify-write cycles on the keys file and key dir.
	mu sync.Mutex
}

// New creates the SSH service.
func New(cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, audit: auditLog}
}

// dryRunErr is the reply of every mutation in dry-run mode.
func (s *Service) dryRunErr() error {
	return apierr.Conflict("dry_run", "SSH key management is disabled in dry-run mode")
}

// accept records an allowed mutation, failing the request when it cannot.
func (s *Service) accept(action string, params map[string]any) error {
	if err := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}); err != nil {
		return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	return nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("sshkeys: write audit log: %v", auditErr)
	}
	return err
}

// List returns the authorized keys, skipping unparsable lines.
func (s *Service) List() ([]Key, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listLocked()
}

// listLocked reads and parses the keys file; a missing file is an empty list.
func (s *Service) listLocked() ([]Key, error) {
	data, err := os.ReadFile(s.cfg.SSHKeysFile)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []Key{}, nil
		}
		return nil, apierr.Internal(fmt.Sprintf("read SSH keys file: %v", err))
	}
	return parseKeyData(data), nil
}

// Add appends one public key line after validation (dedupe by fingerprint).
func (s *Service) Add(keyLine string) (Key, error) {
	if s.cfg.DryRun {
		return Key{}, s.dryRunErr()
	}
	parsed, ok := parsePublicKey(keyLine)
	if !ok {
		return Key{}, s.reject(actionKeyAdd, map[string]any{"key": strings.TrimSpace(keyLine)},
			apierr.BadRequest("invalid_key", "key must be one OpenSSH public-key line with a supported type and a base64 blob"))
	}
	key := keyFromParsed(parsed)
	params := map[string]any{"type": key.Type, "fingerprint": key.Fingerprint, "comment": key.Comment}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.cfg.SSHKeysFile)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return Key{}, apierr.Internal(fmt.Sprintf("read SSH keys file: %v", err))
	}
	for _, existing := range parseKeyData(data) {
		if existing.Fingerprint == key.Fingerprint {
			return Key{}, s.reject(actionKeyAdd, params,
				apierr.Conflict("key_exists", fmt.Sprintf("key %s is already authorized", key.Fingerprint)))
		}
	}
	if err := s.accept(actionKeyAdd, params); err != nil {
		return Key{}, err
	}
	needsNewline := len(data) > 0 && data[len(data)-1] != '\n'
	if err := appendKeysFileLine(s.cfg.SSHKeysFile, key.Line, needsNewline); err != nil {
		return Key{}, apierr.Internal(fmt.Sprintf("append SSH key: %v", err))
	}
	return key, nil
}

// Delete removes every authorized_keys line with the given fingerprint.
func (s *Service) Delete(fingerprint string) error {
	if s.cfg.DryRun {
		return s.dryRunErr()
	}
	params := map[string]any{"fingerprint": fingerprint}

	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.cfg.SSHKeysFile)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return s.reject(actionKeyDelete, params,
				apierr.NotFound("key_not_found", fmt.Sprintf("no authorized key with fingerprint %s", fingerprint)))
		}
		return apierr.Internal(fmt.Sprintf("read SSH keys file: %v", err))
	}

	// Split on "\n" and rejoin so every retained line keeps its bytes.
	lines := strings.Split(string(data), "\n")
	kept := make([]string, 0, len(lines))
	matched := false
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line != "" && !strings.HasPrefix(line, "#") {
			if parsed, ok := parsePublicKey(line); ok && fingerprintOf(parsed.Data) == fingerprint {
				matched = true
				continue
			}
		}
		kept = append(kept, raw)
	}
	if !matched {
		return s.reject(actionKeyDelete, params,
			apierr.NotFound("key_not_found", fmt.Sprintf("no authorized key with fingerprint %s", fingerprint)))
	}
	if err := s.accept(actionKeyDelete, params); err != nil {
		return err
	}
	if err := rewriteKeysFile(s.cfg.SSHKeysFile, []byte(strings.Join(kept, "\n"))); err != nil {
		return apierr.Internal(fmt.Sprintf("rewrite SSH keys file: %v", err))
	}
	return nil
}

// ListGenerated returns generated keypairs without private material.
func (s *Service) ListGenerated() ([]GeneratedKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listGeneratedLocked()
}

// listGeneratedLocked scans the key dir for name + name.pub pairs, sorted by
// name; stray files and unparsable public keys are skipped.
func (s *Service) listGeneratedLocked() ([]GeneratedKey, error) {
	entries, err := os.ReadDir(s.cfg.SSHKeyDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []GeneratedKey{}, nil
		}
		return nil, apierr.Internal(fmt.Sprintf("read SSH key dir: %v", err))
	}
	present := make(map[string]bool, len(entries))
	for _, entry := range entries {
		present[entry.Name()] = true
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || strings.HasSuffix(name, ".pub") || !validKeyName(name) {
			continue
		}
		if !present[name+".pub"] {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)

	keys := make([]GeneratedKey, 0, len(names))
	for _, name := range names {
		key, err := readGeneratedPub(s.cfg.SSHKeyDir, name)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) || errors.Is(err, errUnparsablePub) {
				continue
			}
			return nil, apierr.Internal(fmt.Sprintf("read generated key %s: %v", name, err))
		}
		keys = append(keys, key)
	}
	return keys, nil
}

// ReadGenerated returns one generated keypair including private material.
func (s *Service) ReadGenerated(name string) (GeneratedKey, error) {
	if !validKeyName(name) {
		return GeneratedKey{}, apierr.BadRequest("invalid_name", fmt.Sprintf("invalid key name %q", name))
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	key, err := readGeneratedPub(s.cfg.SSHKeyDir, name)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return GeneratedKey{}, apierr.NotFound("key_not_found", fmt.Sprintf("generated key %q does not exist", name))
		}
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("read generated key %s: %v", name, err))
	}
	priv, err := os.ReadFile(filepath.Join(s.cfg.SSHKeyDir, name))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return GeneratedKey{}, apierr.NotFound("key_not_found", fmt.Sprintf("generated key %q does not exist", name))
		}
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("read generated key %s: %v", name, err))
	}
	key.PrivateKey = strings.TrimSpace(string(priv))
	return key, nil
}

// Generate creates a keypair with ssh-keygen; the returned key includes the
// private key for one-time download.
func (s *Service) Generate(name, keyType, comment string) (GeneratedKey, error) {
	if s.cfg.DryRun {
		return GeneratedKey{}, s.dryRunErr()
	}
	params := map[string]any{"name": name, "type": keyType}
	if !validKeyName(name) {
		return GeneratedKey{}, s.reject(actionKeygenCreate, params,
			apierr.BadRequest("invalid_name", fmt.Sprintf("invalid key name %q (want %s)", name, keyNamePattern)))
	}
	if keyType != "ed25519" && keyType != "rsa" {
		return GeneratedKey{}, s.reject(actionKeygenCreate, params,
			apierr.BadRequest("invalid_key_type", fmt.Sprintf("invalid key type %q (allowed: ed25519, rsa)", keyType)))
	}
	if comment == "" {
		comment = defaultComment
	}
	params["comment"] = comment

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := ensureDirMode(s.cfg.SSHKeyDir, keysDirPerm); err != nil {
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("create SSH key dir: %v", err))
	}
	keyPath := filepath.Join(s.cfg.SSHKeyDir, name)
	pubPath := keyPath + ".pub"
	for _, path := range []string{keyPath, pubPath} {
		if _, err := os.Stat(path); err == nil {
			return GeneratedKey{}, s.reject(actionKeygenCreate, params,
				apierr.Conflict("key_exists", fmt.Sprintf("generated key %q already exists", name)))
		} else if !errors.Is(err, fs.ErrNotExist) {
			return GeneratedKey{}, apierr.Internal(fmt.Sprintf("stat generated key %s: %v", name, err))
		}
	}
	if err := s.accept(actionKeygenCreate, params); err != nil {
		return GeneratedKey{}, err
	}

	bin := s.cfg.SSHKeygenBin
	if bin == "" {
		bin = defaultKeygenBin
	}
	args := []string{"-t", keyType}
	if keyType == "rsa" {
		args = append(args, "-b", "4096")
	}
	args = append(args, "-f", keyPath, "-N", "", "-C", comment)
	if out, err := exec.Command(bin, args...).CombinedOutput(); err != nil {
		os.Remove(keyPath)
		os.Remove(pubPath)
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("run %s: %v: %s", bin, err, strings.TrimSpace(string(out))))
	}
	if err := os.Chmod(keyPath, keysFilePerm); err != nil {
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("set generated key mode: %v", err))
	}

	key, err := readGeneratedPub(s.cfg.SSHKeyDir, name)
	if err != nil {
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("read generated public key: %v", err))
	}
	priv, err := os.ReadFile(keyPath)
	if err != nil {
		return GeneratedKey{}, apierr.Internal(fmt.Sprintf("read generated private key: %v", err))
	}
	key.PrivateKey = strings.TrimSpace(string(priv))
	return key, nil
}

// DeleteGenerated removes a generated keypair (both files).
func (s *Service) DeleteGenerated(name string) error {
	if s.cfg.DryRun {
		return s.dryRunErr()
	}
	params := map[string]any{"name": name}
	if !validKeyName(name) {
		return s.reject(actionKeygenDelete, params,
			apierr.BadRequest("invalid_name", fmt.Sprintf("invalid key name %q", name)))
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	keyPath := filepath.Join(s.cfg.SSHKeyDir, name)
	pubPath := keyPath + ".pub"
	exists := false
	for _, path := range []string{keyPath, pubPath} {
		if _, err := os.Stat(path); err == nil {
			exists = true
		} else if !errors.Is(err, fs.ErrNotExist) {
			return apierr.Internal(fmt.Sprintf("stat generated key %s: %v", name, err))
		}
	}
	if !exists {
		return s.reject(actionKeygenDelete, params,
			apierr.NotFound("key_not_found", fmt.Sprintf("generated key %q does not exist", name)))
	}
	if err := s.accept(actionKeygenDelete, params); err != nil {
		return err
	}
	for _, path := range []string{keyPath, pubPath} {
		if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return apierr.Internal(fmt.Sprintf("remove generated key %s: %v", name, err))
		}
	}
	return nil
}

// Status reports the keys file, key dir and the sshd port.
func (s *Service) Status() Status {
	st := Status{
		KeysFile: s.cfg.SSHKeysFile,
		KeyDir:   s.cfg.SSHKeyDir,
		Port:     sshdPort(s.cfg.SSHConfig),
	}
	if owner, ok := fileOwner(s.cfg.SSHKeysFile); ok {
		st.User = owner
	} else if owner, ok := fileOwner(filepath.Dir(s.cfg.SSHKeysFile)); ok {
		st.User = owner
	} else {
		st.User = "root"
	}
	if hostname, err := os.Hostname(); err == nil {
		st.Hostname = hostname
	}
	return st
}

// fileOwner resolves the user name owning path.
func fileOwner(path string) (string, bool) {
	info, err := os.Stat(path)
	if err != nil {
		return "", false
	}
	sys, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "", false
	}
	owner, err := user.LookupId(strconv.FormatUint(uint64(sys.Uid), 10))
	if err != nil || owner.Username == "" {
		return "", false
	}
	return owner.Username, true
}

// sshdPort returns the last uncommented "Port <n>" in the sshd config, or 22
// when the file is missing or declares no valid port.
func sshdPort(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 22
	}
	port := 22
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 || !strings.EqualFold(fields[0], "Port") {
			continue
		}
		n, err := strconv.Atoi(fields[1])
		if err != nil || n < 1 || n > 65535 {
			continue
		}
		port = n
	}
	return port
}
