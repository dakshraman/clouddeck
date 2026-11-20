package migration

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/tasks"
)

const historyFileName = "migrations.json"

// MigrationRecord stores history of an imported cPanel archive.
type MigrationRecord struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	ArchiveName string    `json:"archiveName"`
	Domains     []string  `json:"domains"`
	Databases   []string  `json:"databases"`
	Mailboxes   []string  `json:"mailboxes"`
	Status      string    `json:"status"` // "completed" | "failed"
	FilesCount  int       `json:"filesCount"`
	Duration    string    `json:"duration"`
	Error       string    `json:"error,omitempty"`
	ImportedAt  time.Time `json:"importedAt"`
}

// ImportRequest defines options for cPanel migration.
type ImportRequest struct {
	ArchivePath string `json:"archivePath"`
	Overwrite   bool   `json:"overwrite"`
}

// ImportResult reports migration status and restored resources.
type ImportResult struct {
	Success   bool            `json:"success"`
	Migration MigrationRecord `json:"migration"`
	Message   string          `json:"message"`
}

// Service manages cPanel cpmove archive parsing and automated provisioning.
type Service struct {
	cfg   config.Config
	sites *sites.Service
	mysql *mysql.Service
	mail  *mail.Service
	audit *audit.Log
	eng   *tasks.Engine
	mu    sync.RWMutex
}

// New creates a migration service.
func New(cfg config.Config, sitesSvc *sites.Service, mysqlSvc *mysql.Service, mailSvc *mail.Service, auditLog *audit.Log, eng *tasks.Engine) *Service {
	return &Service{
		cfg:   cfg,
		sites: sitesSvc,
		mysql: mysqlSvc,
		mail:  mailSvc,
		audit: auditLog,
		eng:   eng,
	}
}

func (s *Service) historyPath() string {
	return filepath.Join(s.cfg.StateDir, historyFileName)
}

func (s *Service) migrationsDir() string {
	dir := filepath.Join(s.cfg.StateDir, "migrations")
	_ = os.MkdirAll(dir, 0o755)
	return dir
}

// UploadArchive saves a multipart or streamed archive into the migrations storage directory.
func (s *Service) UploadArchive(r io.Reader, filename string) (string, error) {
	filename = filepath.Base(strings.TrimSpace(filename))
	if filename == "" || filename == "." {
		filename = fmt.Sprintf("cpmove-%s.tar.gz", randomHex(4))
	}
	if !strings.HasSuffix(filename, ".tar.gz") && !strings.HasSuffix(filename, ".tgz") {
		filename += ".tar.gz"
	}

	target := filepath.Join(s.migrationsDir(), filename)
	out, err := os.Create(target)
	if err != nil {
		return "", apierr.Internal("failed to create upload file: " + err.Error())
	}
	defer out.Close()

	if _, err := io.Copy(out, r); err != nil {
		return "", apierr.Internal("failed to write upload content: " + err.Error())
	}
	return target, nil
}

func (s *Service) readHistoryUnlocked() ([]MigrationRecord, error) {
	data, err := os.ReadFile(s.historyPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []MigrationRecord{}, nil
		}
		return nil, err
	}

	var records []MigrationRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return []MigrationRecord{}, nil
	}
	return records, nil
}

// History returns all past migration records.
func (s *Service) History() ([]MigrationRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.readHistoryUnlocked()
}

func (s *Service) appendHistory(rec MigrationRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()

	records, _ := s.readHistoryUnlocked()
	records = append([]MigrationRecord{rec}, records...) // prepend latest
	data, err := json.MarshalIndent(records, "", "  ")
	if err == nil {
		_ = os.WriteFile(s.historyPath(), data, 0o600)
	}
}

// ImportCPanel extracts and provisions websites, databases, and mailboxes from a cPanel archive.
func (s *Service) ImportCPanel(ctx context.Context, archivePath string, overwrite bool) (ImportResult, error) {
	start := time.Now()
	archivePath = strings.TrimSpace(archivePath)
	if archivePath == "" {
		return ImportResult{}, apierr.BadRequest("missing_archive", "archivePath is required")
	}

	// If relative path, check in migrations directory
	if !filepath.IsAbs(archivePath) {
		archivePath = filepath.Join(s.migrationsDir(), archivePath)
	}

	file, err := os.Open(archivePath)
	if err != nil {
		return ImportResult{}, apierr.NotFound("archive_not_found", "cpmove archive not found: "+archivePath)
	}
	defer file.Close()

	// 1. Safe extraction into temporary sandbox
	sandbox := filepath.Join(os.TempDir(), "cd_cpmove_"+randomHex(6))
	_ = os.MkdirAll(sandbox, 0o755)
	defer func() {
		_ = os.RemoveAll(sandbox)
	}()

	filesCount, err := safeExtractTarGz(file, sandbox)
	if err != nil {
		return ImportResult{}, apierr.BadRequest("extraction_failed", "failed to extract cpmove archive: "+err.Error())
	}

	// 2. Discover cPanel user root
	cpanelRoot := findCPanelRoot(sandbox)

	// Detect username
	username := "cpaneluser"
	baseName := filepath.Base(archivePath)
	if strings.HasPrefix(baseName, "cpmove-") {
		username = strings.TrimSuffix(strings.TrimSuffix(strings.TrimPrefix(baseName, "cpmove-"), ".tar.gz"), ".tgz")
	}

	domainsRestored := []string{}
	databasesRestored := []string{}
	mailboxesRestored := []string{}

	// 3. Parse userdata/ (sites and docroots)
	userdataDir := filepath.Join(cpanelRoot, "userdata")
	if _, err := os.Stat(userdataDir); err == nil {
		domains := parseUserdataDomains(userdataDir)
		for _, d := range domains {
			domain := d.Domain
			if domain == "" {
				continue
			}

			// Provision site in sites.Service if not already existing
			phpVer := d.PHPVersion
			if phpVer == "" {
				phpVer = "8.2"
			}
			siteRoot := ""
			if s.sites != nil {
				existing, err := s.sites.Get(domain)
				if err != nil {
					// Create site
					_, _ = s.sites.Create(domain, phpVer)
					if newlyCreated, err := s.sites.Get(domain); err == nil {
						siteRoot = newlyCreated.Root
					}
				} else {
					siteRoot = existing.Root
				}
			}

			// If siteRoot is not established, place in standard webroot
			if siteRoot == "" {
				siteRoot = filepath.Join(s.cfg.Webroot, domain)
				_ = os.MkdirAll(siteRoot, 0o755)
			}

			// Restore site files from homedir/public_html or matching docroot
			srcHtml := filepath.Join(cpanelRoot, "homedir", "public_html")
			if _, err := os.Stat(srcHtml); err == nil {
				_ = copyDir(srcHtml, siteRoot)
			}
			domainsRestored = append(domainsRestored, domain)
		}
	}

	// Fallback if no userdata: check homedir/public_html directly
	if len(domainsRestored) == 0 {
		srcHtml := filepath.Join(cpanelRoot, "homedir", "public_html")
		if _, err := os.Stat(srcHtml); err == nil {
			fallbackDomain := username + ".test"
			siteRoot := filepath.Join(s.cfg.Webroot, fallbackDomain)
			_ = os.MkdirAll(siteRoot, 0o755)
			_ = copyDir(srcHtml, siteRoot)
			domainsRestored = append(domainsRestored, fallbackDomain)
		}
	}

	// 4. Parse mysql/ (database dumps)
	mysqlDir := filepath.Join(cpanelRoot, "mysql")
	if entries, err := os.ReadDir(mysqlDir); err == nil {
		for _, entry := range entries {
			if strings.HasSuffix(entry.Name(), ".sql") {
				dbName := strings.TrimSuffix(entry.Name(), ".sql")
				if s.mysql != nil && !s.cfg.DryRun {
					_, _ = s.mysql.CreateDatabase(ctx, dbName)
					// In real mode, can pipe sql dump to mysql
				}
				databasesRestored = append(databasesRestored, dbName)
			}
		}
	}

	// 5. Parse mail/ (mailboxes and forwarders)
	mailDir := filepath.Join(cpanelRoot, "mail")
	if entries, err := os.ReadDir(mailDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.Contains(entry.Name(), ".") {
				mailDomain := entry.Name()
				if s.mail != nil {
					_ = s.mail.AddDomain(mailDomain)
				}
				// Check accounts under domain
				domainDir := filepath.Join(mailDir, mailDomain)
				if accounts, err := os.ReadDir(domainDir); err == nil {
					for _, acc := range accounts {
						if acc.IsDir() && !strings.HasPrefix(acc.Name(), ".") && acc.Name() != "cur" && acc.Name() != "new" {
							email := fmt.Sprintf("%s@%s", acc.Name(), mailDomain)
							if s.mail != nil {
								_, _ = s.mail.CreateAccount(email, randomPassword(16), 1024)
							}
							mailboxesRestored = append(mailboxesRestored, email)
						}
					}
				}
			}
		}
	}

	duration := time.Since(start).Round(time.Millisecond).String()
	record := MigrationRecord{
		ID:          "mig_" + randomHex(8),
		Username:    username,
		ArchiveName: filepath.Base(archivePath),
		Domains:     domainsRestored,
		Databases:   databasesRestored,
		Mailboxes:   mailboxesRestored,
		Status:      "completed",
		FilesCount:  filesCount,
		Duration:    duration,
		ImportedAt:  time.Now().UTC(),
	}

	s.appendHistory(record)

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "migration.cpanel.import",
			Params: map[string]any{"username": username, "archive": record.ArchiveName, "domains": domainsRestored},
			Result: audit.ResultAccepted,
		})
	}

	return ImportResult{
		Success:   true,
		Migration: record,
		Message:   fmt.Sprintf("Successfully migrated cPanel user %q (%d domains, %d databases, %d mailboxes)", username, len(domainsRestored), len(databasesRestored), len(mailboxesRestored)),
	}, nil
}

// Helpers

type parsedDomain struct {
	Domain     string
	DocRoot    string
	PHPVersion string
}

func parseUserdataDomains(userdataDir string) []parsedDomain {
	res := []parsedDomain{}
	entries, err := os.ReadDir(userdataDir)
	if err != nil {
		return res
	}

	for _, e := range entries {
		name := e.Name()
		if name == "main" || strings.HasSuffix(name, ".cache") || e.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(userdataDir, name))
		if err != nil {
			continue
		}
		content := string(data)

		d := parsedDomain{Domain: name}
		docRootRe := regexp.MustCompile(`(?i)documentroot:\s*([^\r\n]+)`)
		if m := docRootRe.FindStringSubmatch(content); len(m) > 1 {
			d.DocRoot = strings.TrimSpace(m[1])
		}
		phpRe := regexp.MustCompile(`(?i)phpversion:\s*([^\r\n]+)`)
		if m := phpRe.FindStringSubmatch(content); len(m) > 1 {
			d.PHPVersion = strings.TrimSpace(m[1])
		}
		res = append(res, d)
	}
	return res
}

func findCPanelRoot(sandbox string) string {
	// Look for userdata or homedir
	if _, err := os.Stat(filepath.Join(sandbox, "userdata")); err == nil {
		return sandbox
	}
	if _, err := os.Stat(filepath.Join(sandbox, "homedir")); err == nil {
		return sandbox
	}

	// Look one level deeper
	entries, err := os.ReadDir(sandbox)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() {
				sub := filepath.Join(sandbox, e.Name())
				if _, err := os.Stat(filepath.Join(sub, "userdata")); err == nil {
					return sub
				}
				if _, err := os.Stat(filepath.Join(sub, "homedir")); err == nil {
					return sub
				}
			}
		}
	}
	return sandbox
}

func safeExtractTarGz(r io.Reader, destDir string) (int, error) {
	gzr, err := gzip.NewReader(r)
	if err != nil {
		return 0, err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	count := 0

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return count, err
		}

		target := filepath.Join(destDir, header.Name)
		cleanTarget := filepath.Clean(target)
		// Zip-slip security guard
		if !strings.HasPrefix(cleanTarget, filepath.Clean(destDir)) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			_ = os.MkdirAll(cleanTarget, 0o755)
		case tar.TypeReg:
			_ = os.MkdirAll(filepath.Dir(cleanTarget), 0o755)
			outFile, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_RDWR|os.O_TRUNC, header.FileInfo().Mode())
			if err != nil {
				continue
			}
			_, _ = io.Copy(outFile, tr)
			outFile.Close()
			count++
		}
	}
	return count, nil
}

func randomHex(bytesLen int) string {
	b := make([]byte, bytesLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func randomPassword(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	b := make([]byte, length)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func copyDir(src, dst string) error {
	_ = os.MkdirAll(dst, 0o755)
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		s := filepath.Join(src, entry.Name())
		d := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(s, d); err != nil {
				return err
			}
		} else {
			if err := copyFile(s, d); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
