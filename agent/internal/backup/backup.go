// Package backup creates, lists, restores and deletes backup archives for
// the backup endpoints. Creating and restoring run as tasks on the shared
// engine; listing, reading and deletion are synchronous. Mutations are
// written to the audit log.
package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	stdlog "log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mysql"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

// Archive kinds.
const (
	KindSite     = "site"
	KindDatabase = "database"
)

// Task types and audit actions owned by this package.
const (
	TaskCreate   = "backup.create"
	TaskRestore  = "backup.restore"
	ActionDelete = "backup.delete"

	// ActionScheduleSet audits a v0.4 backup schedule change
	// (docs/api.md section 1.8).
	ActionScheduleSet = "backup.schedule.set"
)

// Timeouts and limits. Restores must not hang forever on a wedged server;
// dumps and uploads get the same generous budget.
const (
	queryTimeout    = 30 * time.Second
	dumpTimeout     = 10 * time.Minute
	restoreTimeout  = 10 * time.Minute
	uploadTimeout   = 10 * time.Minute
	stderrTailRunes = 300
)

// idRe is the frozen archive id regex from docs/api.md section 1.5. It also
// keeps archive names lowercase, so database archive names are lowercased at
// creation time (MariaDB database names may contain uppercase letters).
var (
	idRe       = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,199}$`)
	siteFileRe = regexp.MustCompile(`^site-(.+)-([0-9]{1,10})\.tar\.gz$`)
	dbFileRe   = regexp.MustCompile(`^database-([a-z0-9_]{1,64})-([0-9]{1,10})\.sql\.gz$`)
	remoteRe   = regexp.MustCompile(`^[A-Za-z0-9_.-]+:.+$`)
)

// Archive is one backup file's metadata. ID is the file name.
type Archive struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Source    string    `json:"source"`
	SizeBytes int64     `json:"sizeBytes"`
	CreatedAt time.Time `json:"createdAt"`
}

// UploadTarget is one post-backup upload: Telegram (Bot API) or an
// rclone remote (Google Drive/MEGA/Dropbox/...).
type UploadTarget struct {
	Type   string `json:"type"`
	Remote string `json:"remote,omitempty"`
}

// CreateRequest is the POST /v1/backups body.
type CreateRequest struct {
	Kind     string         `json:"kind"`
	Site     string         `json:"site,omitempty"`
	Database string         `json:"database,omitempty"`
	Uploads  []UploadTarget `json:"uploads,omitempty"`
}

// Service builds and manages backup archives.
type Service struct {
	cfg   config.Config
	eng   *tasks.Engine
	sites *sites.Service
	audit *audit.Log

	// v0.4 scheduled backups (docs/api.md section 1.8). stateMu guards the
	// schedule and ledger files plus nextLocal; runMu admits at most one
	// scheduled run at a time; nextLocal remembers the next occurrence
	// in-process when persisting it fails.
	stateMu   sync.Mutex
	runMu     sync.Mutex
	nextLocal time.Time
}

// New creates the service.
func New(cfg config.Config, eng *tasks.Engine, siteSvc *sites.Service, auditLog *audit.Log) *Service {
	return &Service{cfg: cfg, eng: eng, sites: siteSvc, audit: auditLog}
}

// dryRunErr is the frozen reply of every mutating backup endpoint in dry-run
// mode.
func dryRunErr() error {
	return apierr.Conflict("dry_run", "backup operations are disabled in dry-run mode")
}

// Create validates the request synchronously and starts a backup.create
// task. Errors: 400 invalid_request, 404 site_not_found /
// database_not_found, 409 dry_run, 412 telegram_not_configured.
func (s *Service) Create(ctx context.Context, req CreateRequest) (store.Task, error) {
	if s.cfg.DryRun {
		return store.Task{}, dryRunErr()
	}
	target, err := s.resolveTarget(ctx, req)
	if err != nil {
		return store.Task{}, err
	}
	if err := s.validateUploads(req.Uploads); err != nil {
		return store.Task{}, err
	}
	return s.startTask(target, req.Uploads, nil)
}

// backupTarget is one resolved, validated backup destination. source is the
// archive's source (site domain or database name); webroot and database are
// the kind-specific inputs of the archive run.
type backupTarget struct {
	kind     string
	source   string
	webroot  string
	database string
}

// resolveTarget validates a create request and resolves it to the archive's
// target. Everything the task needs is resolved (and validated) before it
// starts, so a bad request never shows up as a failed task later.
func (s *Service) resolveTarget(ctx context.Context, req CreateRequest) (backupTarget, error) {
	switch req.Kind {
	case KindSite:
		if strings.TrimSpace(req.Site) == "" {
			return backupTarget{}, apierr.BadRequest("invalid_request", "site is required when kind is \"site\"")
		}
		if _, err := sites.ValidateDomain(req.Site); err != nil {
			return backupTarget{}, apierr.BadRequest("invalid_request", err.Error())
		}
		site, err := s.sites.Get(req.Site)
		if err != nil {
			return backupTarget{}, err
		}
		return backupTarget{kind: KindSite, source: site.Domain, webroot: site.Root}, nil
	case KindDatabase:
		if strings.TrimSpace(req.Database) == "" {
			return backupTarget{}, apierr.BadRequest("invalid_request", "database is required when kind is \"database\"")
		}
		name, err := mysql.ValidateDatabase(req.Database)
		if err != nil {
			return backupTarget{}, apierr.BadRequest("invalid_request", err.Error())
		}
		actual, err := s.findDatabase(ctx, name)
		if err != nil {
			return backupTarget{}, err
		}
		return backupTarget{kind: KindDatabase, source: actual, database: actual}, nil
	default:
		return backupTarget{}, apierr.BadRequest("invalid_request", fmt.Sprintf("unsupported backup kind %q", req.Kind))
	}
}

// startTask starts one backup.create task for an already resolved target.
// onSuccess, when non-nil, receives the archive id after the archive and
// every upload succeeded; it runs as part of the task, so it must be quick
// and must not fail the task (scheduled pruning hooks log their errors).
func (s *Service) startTask(target backupTarget, uploads []UploadTarget, onSuccess func(archiveID string)) (store.Task, error) {
	name := archiveName(target.kind, target.source, time.Now().Unix())
	if !idRe.MatchString(name) {
		// Only reachable for pathologically long domains; the archive must be
		// addressable by its id.
		return store.Task{}, apierr.BadRequest("invalid_request", fmt.Sprintf("site %q is too long for an archive name", target.source))
	}

	task, err := s.eng.Create(TaskCreate, target.source, func(ctx context.Context, log tasks.LogFunc) error {
		if err := os.MkdirAll(s.cfg.BackupDir, 0o755); err != nil {
			return fmt.Errorf("create backup dir %s: %w", s.cfg.BackupDir, err)
		}
		archivePath := filepath.Join(s.cfg.BackupDir, name)
		log("info", fmt.Sprintf("creating %s backup of %s", target.kind, target.source))
		switch target.kind {
		case KindSite:
			if err := writeSiteArchive(archivePath, target.webroot, log); err != nil {
				return err
			}
		case KindDatabase:
			if err := s.dumpDatabase(ctx, archivePath, target.database, log); err != nil {
				return err
			}
		}
		info, err := os.Stat(archivePath)
		if err != nil {
			return fmt.Errorf("stat archive: %w", err)
		}
		log("info", fmt.Sprintf("archive %s created (%d bytes)", name, info.Size()))
		for _, upload := range uploads {
			if err := s.runUpload(ctx, log, archivePath, upload); err != nil {
				return err
			}
		}
		if onSuccess != nil {
			onSuccess(name)
		}
		return nil
	})
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// List returns the local archives, newest first; unparseable files are
// skipped.
func (s *Service) List() ([]Archive, error) {
	entries, err := os.ReadDir(s.cfg.BackupDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return []Archive{}, nil
		}
		return nil, apierr.Internal(fmt.Sprintf("read backup dir %s: %v", s.cfg.BackupDir, err))
	}
	archives := make([]Archive, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !idRe.MatchString(name) {
			continue
		}
		parsed, ok := parseName(name)
		if !ok {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		archives = append(archives, Archive{
			ID:        name,
			Kind:      parsed.kind,
			Source:    parsed.source,
			SizeBytes: info.Size(),
			CreatedAt: createdAt(parsed, info),
		})
	}
	sort.Slice(archives, func(i, j int) bool {
		if !archives[i].CreatedAt.Equal(archives[j].CreatedAt) {
			return archives[i].CreatedAt.After(archives[j].CreatedAt)
		}
		return archives[i].ID < archives[j].ID
	})
	return archives, nil
}

// Get returns one archive's metadata by ID.
func (s *Service) Get(id string) (Archive, error) {
	parsed, info, err := s.locate(id)
	if err != nil {
		return Archive{}, err
	}
	return Archive{
		ID:        id,
		Kind:      parsed.kind,
		Source:    parsed.source,
		SizeBytes: info.Size(),
		CreatedAt: createdAt(parsed, info),
	}, nil
}

// Path returns the validated absolute path of one archive, ready for
// download (or os.Open).
func (s *Service) Path(id string) (string, error) {
	if _, _, err := s.locate(id); err != nil {
		return "", err
	}
	return filepath.Join(s.cfg.BackupDir, id), nil
}

// Restore validates the archive synchronously and starts a
// backup.restore task. Errors: 400 invalid_id, 404 backup_not_found /
// site_not_found / database_not_found, 409 dry_run.
func (s *Service) Restore(ctx context.Context, id string) (store.Task, error) {
	if s.cfg.DryRun {
		return store.Task{}, dryRunErr()
	}
	archive, err := s.Get(id)
	if err != nil {
		return store.Task{}, err
	}
	archivePath := filepath.Join(s.cfg.BackupDir, archive.ID)

	// The task's site field carries the archive's source; both restore paths
	// re-resolve the target now so a deleted site or database fails fast.
	var run tasks.RunFunc
	switch archive.Kind {
	case KindSite:
		site, err := s.sites.Get(archive.Source)
		if err != nil {
			return store.Task{}, err
		}
		run = func(ctx context.Context, log tasks.LogFunc) error {
			log("info", fmt.Sprintf("restoring archive %s into %s", archive.ID, site.Root))
			return restoreSiteArchive(archivePath, site.Root, log)
		}
	case KindDatabase:
		name, err := s.findDatabase(ctx, archive.Source)
		if err != nil {
			return store.Task{}, err
		}
		run = func(ctx context.Context, log tasks.LogFunc) error {
			return s.restoreDatabase(ctx, archivePath, name, log)
		}
	default:
		return store.Task{}, apierr.BadRequest("invalid_id", fmt.Sprintf("invalid backup id %q", id))
	}

	task, err := s.eng.Create(TaskRestore, archive.Source, run)
	if err != nil {
		return store.Task{}, apierr.Internal(fmt.Sprintf("start task: %v", err))
	}
	return task, nil
}

// Delete removes one archive. Errors: 400 invalid_id, 404
// backup_not_found, 409 dry_run.
func (s *Service) Delete(id string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"id": id}
	if _, err := s.Get(id); err != nil {
		return s.reject(ActionDelete, params, err)
	}
	if err := s.audit.Append(audit.Record{Action: ActionDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := os.Remove(filepath.Join(s.cfg.BackupDir, id)); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return apierr.NotFound("backup_not_found", fmt.Sprintf("backup %q does not exist", id))
		}
		return apierr.Internal(fmt.Sprintf("delete backup %s: %v", id, err))
	}
	return nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("backup: write audit log: %v", auditErr)
	}
	return err
}

// ---------------------------------------------------------------------------
// Archive names

// parsedName is the decoded meaning of one archive file name.
type parsedName struct {
	kind   string
	source string
	at     time.Time
}

// archiveName builds the deterministic archive file name for kind/source. The
// result is lowercased so it always matches idRe.
func archiveName(kind, source string, unix int64) string {
	source = strings.ToLower(source)
	if kind == KindSite {
		return fmt.Sprintf("site-%s-%d.tar.gz", source, unix)
	}
	return fmt.Sprintf("database-%s-%d.sql.gz", source, unix)
}

// parseName decodes an archive file name against the two documented patterns.
// The domain pattern resolves the greedy capture through ValidateDomain, and
// database names go through ValidateDatabase so system schemas can never be
// restored or deleted through a backup id.
func parseName(name string) (parsedName, bool) {
	if m := siteFileRe.FindStringSubmatch(name); m != nil {
		domain, err := sites.ValidateDomain(m[1])
		if err != nil {
			return parsedName{}, false
		}
		unix, err := strconv.ParseInt(m[2], 10, 64)
		if err != nil {
			return parsedName{}, false
		}
		return parsedName{kind: KindSite, source: domain, at: time.Unix(unix, 0).UTC()}, true
	}
	if m := dbFileRe.FindStringSubmatch(name); m != nil {
		database, err := mysql.ValidateDatabase(m[1])
		if err != nil {
			return parsedName{}, false
		}
		unix, err := strconv.ParseInt(m[2], 10, 64)
		if err != nil {
			return parsedName{}, false
		}
		return parsedName{kind: KindDatabase, source: database, at: time.Unix(unix, 0).UTC()}, true
	}
	return parsedName{}, false
}

// createdAt prefers the epoch encoded in the file name and falls back to the
// file's modification time.
func createdAt(parsed parsedName, info os.FileInfo) time.Time {
	if !parsed.at.IsZero() {
		return parsed.at
	}
	return info.ModTime().UTC().Truncate(time.Second)
}

// locate validates id, parses the archive name and stats the file. A symlink
// named like an archive is not a backup: Lstat keeps Path from ever handing
// the download handler a link to follow. Errors: 400 invalid_id, 404
// backup_not_found, 500 for unexpected stat failures.
func (s *Service) locate(id string) (parsedName, os.FileInfo, error) {
	if !idRe.MatchString(id) {
		return parsedName{}, nil, apierr.BadRequest("invalid_id", fmt.Sprintf("invalid backup id %q", id))
	}
	parsed, ok := parseName(id)
	if !ok {
		return parsedName{}, nil, apierr.BadRequest("invalid_id", fmt.Sprintf("invalid backup id %q", id))
	}
	info, err := os.Lstat(filepath.Join(s.cfg.BackupDir, id))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return parsedName{}, nil, apierr.NotFound("backup_not_found", fmt.Sprintf("backup %q does not exist", id))
		}
		return parsedName{}, nil, apierr.Internal(fmt.Sprintf("stat backup %s: %v", id, err))
	}
	if !info.Mode().IsRegular() {
		return parsedName{}, nil, apierr.NotFound("backup_not_found", fmt.Sprintf("backup %q does not exist", id))
	}
	return parsed, info, nil
}

// ---------------------------------------------------------------------------
// Site archives

// writeSiteArchive writes the webroot at root as a gzip tar to archivePath.
// Symlinks and other non-regular entries are skipped, never followed, so a
// later restore can never escape the webroot. The archive is built under a
// temp name and renamed into place, so a failed or partial backup never shows
// up in List.
func writeSiteArchive(archivePath, root string, log tasks.LogFunc) error {
	tmp, err := os.CreateTemp(filepath.Dir(archivePath), ".backup-*.tar.gz")
	if err != nil {
		return fmt.Errorf("create temp archive: %w", err)
	}
	tmpName := tmp.Name()
	keep := false
	defer func() {
		if !keep {
			tmp.Close()
			os.Remove(tmpName)
		}
	}()
	if err := tmp.Chmod(0o600); err != nil {
		return fmt.Errorf("chmod temp archive: %w", err)
	}

	gz := gzip.NewWriter(tmp)
	tw := tar.NewWriter(gz)
	files, skipped := 0, 0
	walkErr := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == root {
			return nil
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if d.Type()&fs.ModeSymlink != 0 {
			skipped++
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case info.IsDir():
			hdr := &tar.Header{
				Name:     rel + "/",
				Typeflag: tar.TypeDir,
				Mode:     int64(info.Mode().Perm()),
				ModTime:  info.ModTime(),
			}
			return tw.WriteHeader(hdr)
		case info.Mode().IsRegular():
			hdr, err := tar.FileInfoHeader(info, "")
			if err != nil {
				return err
			}
			hdr.Name = rel
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			f, err := os.Open(p)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(tw, f)
			closeErr := f.Close()
			if copyErr != nil {
				return copyErr
			}
			if closeErr != nil {
				return closeErr
			}
			files++
			return nil
		default:
			// Sockets, devices and the like have no place in a site backup.
			skipped++
			return nil
		}
	})
	if walkErr != nil {
		return fmt.Errorf("archive webroot %s: %w", root, walkErr)
	}
	if err := tw.Close(); err != nil {
		return fmt.Errorf("finish tar stream: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("finish gzip stream: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close archive: %w", err)
	}
	if err := os.Rename(tmpName, archivePath); err != nil {
		return fmt.Errorf("store archive %s: %w", archivePath, err)
	}
	keep = true
	log("info", fmt.Sprintf("archived %d files (skipped %d non-regular entries)", files, skipped))
	return nil
}

// restoreSiteArchive extracts the gzip tar at archivePath into root. Every
// entry is sanitized: absolute paths and ".." traversal fail the whole
// restore, only regular files and directories are written, and existing files
// are overwritten.
func restoreSiteArchive(archivePath, root string, log tasks.LogFunc) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("read gzip archive: %w", err)
	}
	defer gz.Close()

	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("create webroot %s: %w", root, err)
	}
	root = filepath.Clean(root)

	tr := tar.NewReader(gz)
	files, skipped := 0, 0
	var written int64
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fmt.Errorf("read tar entry: %w", err)
		}
		rel, err := safeEntryPath(hdr.Name)
		if err != nil {
			return err
		}
		target := filepath.Join(root, filepath.FromSlash(rel))
		if !withinRoot(root, target) {
			return fmt.Errorf("tar entry %q escapes the webroot", hdr.Name)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return fmt.Errorf("create directory %s: %w", target, err)
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return fmt.Errorf("create directory %s: %w", filepath.Dir(target), err)
			}
			mode := fs.FileMode(hdr.Mode).Perm()
			if mode == 0 {
				mode = 0o644
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return fmt.Errorf("create file %s: %w", target, err)
			}
			// tar.Reader stops at the end of the entry, so io.Copy cannot
			// spill neighbour data into the file.
			n, copyErr := io.Copy(out, tr)
			closeErr := out.Close()
			if copyErr != nil {
				return fmt.Errorf("write file %s: %w", target, copyErr)
			}
			if closeErr != nil {
				return fmt.Errorf("close file %s: %w", target, closeErr)
			}
			files++
			written += n
		default:
			// Symlinks, hardlinks and devices are never recreated: a restore
			// must not be able to plant a link that escapes the webroot.
			log("warn", fmt.Sprintf("skipped unsupported tar entry %q", hdr.Name))
			skipped++
		}
	}
	log("info", fmt.Sprintf("restored %d files (%d bytes)", files, written))
	if skipped > 0 {
		log("warn", fmt.Sprintf("skipped %d unsupported entries", skipped))
	}
	return nil
}

// safeEntryPath sanitizes one tar entry name into a slash-separated relative
// path. Absolute paths, NUL bytes and ".." traversal are rejected.
func safeEntryPath(name string) (string, error) {
	if name == "" || strings.ContainsRune(name, 0) {
		return "", fmt.Errorf("tar entry has an unsafe name %q", name)
	}
	cleaned := path.Clean(name)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || path.IsAbs(cleaned) {
		return "", fmt.Errorf("tar entry has an unsafe name %q", name)
	}
	return cleaned, nil
}

// withinRoot reports whether target is root itself or lives inside it.
func withinRoot(root, target string) bool {
	return target == root || strings.HasPrefix(target, root+string(filepath.Separator))
}

// ---------------------------------------------------------------------------
// Database archives

// dumpDatabase streams mysqldump output for name through gzip into
// archivePath. The root password travels via MYSQL_PWD, never in argv. The
// dump is written under a temp name and renamed into place.
func (s *Service) dumpDatabase(ctx context.Context, archivePath, name string, log tasks.LogFunc) error {
	bin, err := exec.LookPath(s.cfg.MySQLDumpBin)
	if err != nil {
		return fmt.Errorf("mysqldump %q is not installed on this server", s.cfg.MySQLDumpBin)
	}

	tmp, err := os.CreateTemp(filepath.Dir(archivePath), ".backup-*.sql.gz")
	if err != nil {
		return fmt.Errorf("create temp archive: %w", err)
	}
	tmpName := tmp.Name()
	keep := false
	defer func() {
		if !keep {
			tmp.Close()
			os.Remove(tmpName)
		}
	}()
	if err := tmp.Chmod(0o600); err != nil {
		return fmt.Errorf("chmod temp archive: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, dumpTimeout)
	defer cancel()

	// --skip-add-drop-table honours the documented restore promise that no
	// existing tables are dropped.
	args := []string{"--skip-add-drop-table", "-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, name)

	gz := gzip.NewWriter(tmp)
	cmd := exec.CommandContext(ctx, bin, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	cmd.Stdout = gz
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	log("info", fmt.Sprintf("dumping database %q", name))
	runErr := cmd.Run()
	gzErr := gz.Close()
	tmpErr := tmp.Close()
	switch {
	case runErr != nil:
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("mysqldump timed out after %s", dumpTimeout)
		}
		if errors.Is(ctx.Err(), context.Canceled) {
			return fmt.Errorf("mysqldump canceled")
		}
		if detail := tailText(stderr.String()); detail != "" {
			return fmt.Errorf("mysqldump failed: %w: %s", runErr, detail)
		}
		return fmt.Errorf("mysqldump failed: %w", runErr)
	case gzErr != nil:
		return fmt.Errorf("finish gzip stream: %w", gzErr)
	case tmpErr != nil:
		return fmt.Errorf("close archive: %w", tmpErr)
	}
	if err := os.Rename(tmpName, archivePath); err != nil {
		return fmt.Errorf("store archive %s: %w", archivePath, err)
	}
	keep = true
	return nil
}

// restoreDatabase feeds the gzip dump at archivePath into the mysql client
// for name. Tables are never dropped by the agent itself; the dump is
// expected to be one of ours (no DROP DATABASE, no --databases).
func (s *Service) restoreDatabase(ctx context.Context, archivePath, name string, log tasks.LogFunc) error {
	bin, err := exec.LookPath(s.cfg.MySQLBin)
	if err != nil {
		return fmt.Errorf("mysql client %q is not installed on this server", s.cfg.MySQLBin)
	}
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("read gzip archive: %w", err)
	}
	defer gz.Close()

	ctx, cancel := context.WithTimeout(ctx, restoreTimeout)
	defer cancel()

	args := []string{"-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, name)

	cmd := exec.CommandContext(ctx, bin, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	counter := &countReader{r: gz}
	cmd.Stdin = counter
	cmd.Stdout = io.Discard
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	log("info", fmt.Sprintf("feeding archive into database %q", name))
	runErr := cmd.Run()
	if runErr != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return fmt.Errorf("mysql restore timed out after %s", restoreTimeout)
		}
		if errors.Is(ctx.Err(), context.Canceled) {
			return fmt.Errorf("mysql restore canceled")
		}
		if detail := tailText(stderr.String()); detail != "" {
			return fmt.Errorf("mysql restore failed: %w: %s", runErr, detail)
		}
		return fmt.Errorf("mysql restore failed: %w", runErr)
	}
	log("info", fmt.Sprintf("restored %d bytes into database %q", counter.n, name))
	return nil
}

// findDatabase resolves name to the server's spelling of an existing
// database, matching case-insensitively (the same rule the MySQL service
// uses). Errors mirror the MySQL endpoints: missing client or unreachable
// server -> 503 mysql_unavailable, other client failures -> 500 mysql_error,
// no match -> 404 database_not_found.
func (s *Service) findDatabase(ctx context.Context, name string) (string, error) {
	out, err := s.mysqlQuery(ctx, "SHOW DATABASES")
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(strings.TrimRight(line, "\r"))
		if line != "" && strings.EqualFold(line, name) {
			return line, nil
		}
	}
	return "", apierr.NotFound("database_not_found", fmt.Sprintf("database %q does not exist", name))
}

// mysqlQuery runs one statement through the client binary with an argument
// array (never a shell), passing the root password via MYSQL_PWD, and returns
// its stdout. It mirrors the invocation rules of the MySQL service.
func (s *Service) mysqlQuery(ctx context.Context, sql string) (string, error) {
	bin, err := exec.LookPath(s.cfg.MySQLBin)
	if err != nil {
		return "", apierr.New(http.StatusServiceUnavailable, "mysql_unavailable",
			fmt.Sprintf("mysql client %q is not installed on this server", s.cfg.MySQLBin))
	}

	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	args := []string{"--batch", "--skip-column-names", "-u", s.cfg.MySQLRootUser}
	if s.cfg.MySQLHost != "" {
		args = append(args, "-h", s.cfg.MySQLHost)
	}
	if s.cfg.MySQLPort != "" {
		args = append(args, "-P", s.cfg.MySQLPort)
	}
	args = append(args, "-e", sql)

	cmd := exec.CommandContext(ctx, bin, args...)
	if s.cfg.MySQLRootPass != "" {
		cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.MySQLRootPass)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	if runErr == nil {
		return stdout.String(), nil
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "", apierr.New(http.StatusInternalServerError, "mysql_error",
			fmt.Sprintf("mysql client timed out after %s", queryTimeout))
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return "", apierr.New(http.StatusInternalServerError, "mysql_error", "mysql client invocation canceled")
	}

	detail := tailText(stderr.String())
	if detail == "" {
		detail = fmt.Sprintf("mysql client failed: %v", runErr)
	}
	if mysqlUnavailable(stderr.String()) {
		return "", apierr.New(http.StatusServiceUnavailable, "mysql_unavailable", "mysql server is not reachable: "+detail)
	}
	return "", apierr.New(http.StatusInternalServerError, "mysql_error", detail)
}

// mysqlUnavailable reports whether client stderr shows an unreachable server.
func mysqlUnavailable(stderr string) bool {
	lower := strings.ToLower(stderr)
	return strings.Contains(lower, "can't connect") || strings.Contains(lower, "unknown socket")
}

// tailText collapses raw to a single line and keeps its last stderrTailRunes
// characters, which is where the client puts the actual failure.
func tailText(raw string) string {
	joined := strings.Join(strings.Fields(raw), " ")
	runes := []rune(joined)
	if len(runes) > stderrTailRunes {
		return "..." + string(runes[len(runes)-stderrTailRunes:])
	}
	return joined
}

// ---------------------------------------------------------------------------
// Uploads

// validateUploads checks every upload target before the task starts, so a
// missing Telegram configuration or a malformed rclone remote is a synchronous
// 412/400 instead of a late task failure.
func (s *Service) validateUploads(uploads []UploadTarget) error {
	for i, upload := range uploads {
		switch upload.Type {
		case "telegram":
			if s.cfg.TelegramBotToken == "" || s.cfg.TelegramChatID == "" {
				return apierr.New(http.StatusPreconditionFailed, "telegram_not_configured",
					"telegram uploads need AGENT_TELEGRAM_BOT_TOKEN and AGENT_TELEGRAM_CHAT_ID")
			}
		case "rclone":
			if !remoteRe.MatchString(upload.Remote) {
				return apierr.BadRequest("invalid_request",
					fmt.Sprintf("uploads[%d]: rclone remote %q must look like \"name:path\"", i, upload.Remote))
			}
		default:
			return apierr.BadRequest("invalid_request", fmt.Sprintf("uploads[%d]: unsupported upload type %q", i, upload.Type))
		}
	}
	return nil
}

// runUpload executes one validated upload target, logging the attempt and the
// result. A failure is returned so the task fails; the local archive is kept
// either way.
func (s *Service) runUpload(ctx context.Context, log tasks.LogFunc, archivePath string, upload UploadTarget) error {
	switch upload.Type {
	case "telegram":
		log("info", "uploading archive to Telegram")
		if err := s.uploadTelegram(ctx, archivePath); err != nil {
			log("error", "Telegram upload failed: "+err.Error())
			return err
		}
		log("info", "archive uploaded to Telegram")
		return nil
	case "rclone":
		log("info", fmt.Sprintf("uploading archive to rclone remote %q", upload.Remote))
		if err := safeexec.Run(ctx, false, log, s.cfg.RcloneBin, "copy", archivePath, upload.Remote); err != nil {
			log("error", fmt.Sprintf("rclone upload to %q failed", upload.Remote))
			return fmt.Errorf("rclone upload to %q failed: %w", upload.Remote, err)
		}
		log("info", fmt.Sprintf("archive uploaded to rclone remote %q", upload.Remote))
		return nil
	}
	return fmt.Errorf("unsupported upload type %q", upload.Type)
}

// uploadTelegram POSTs archivePath as multipart sendDocument to the Bot API,
// streaming the file through an io.Pipe so large archives are never buffered
// in memory.
func (s *Service) uploadTelegram(ctx context.Context, archivePath string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	contentType := mw.FormDataContentType()
	go func() {
		err := mw.WriteField("chat_id", s.cfg.TelegramChatID)
		if err == nil {
			var part io.Writer
			part, err = mw.CreateFormFile("document", filepath.Base(archivePath))
			if err == nil {
				_, err = io.Copy(part, f)
			}
		}
		mw.Close()
		pw.CloseWithError(err)
	}()

	ctx, cancel := context.WithTimeout(ctx, uploadTimeout)
	defer cancel()

	url := strings.TrimRight(s.cfg.TelegramAPI, "/") + "/bot" + s.cfg.TelegramBotToken + "/sendDocument"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, pr)
	if err != nil {
		pr.CloseWithError(err)
		return fmt.Errorf("build telegram request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return fmt.Errorf("telegram upload: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("telegram upload failed: HTTP %d: %s", resp.StatusCode, tailText(string(body)))
	}
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(body, &result); err == nil && !result.OK {
		return fmt.Errorf("telegram upload rejected: %s", result.Description)
	}
	return nil
}

// countReader counts the bytes read through it.
type countReader struct {
	r io.Reader
	n int64
}

func (c *countReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}
