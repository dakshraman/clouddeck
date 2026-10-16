// Package files implements the site file manager: path-confined,
// symlink-rejecting file operations under each site's webroot. All mutations
// are audited. All endpoints return 409 dry_run when the agent is in dry-run
// mode (see docs/api.md section 1.1).
package files

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	stdlog "log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

// Limits from docs/api.md section 1.1.
const (
	maxPathLen     = 1024
	maxTextBytes   = 2 << 20   // read/write content cap
	maxUploadBytes = 100 << 20 // per multipart file
)

// Audit actions owned by this package.
const (
	ActionWrite  = "file.write"
	ActionUpload = "file.upload"
	ActionMkdir  = "file.mkdir"
	ActionRename = "file.rename"
	ActionDelete = "file.delete"
)

// Entry is one directory listing row.
type Entry struct {
	Name       string    `json:"name"`
	Type       string    `json:"type"` // file | dir | symlink
	SizeBytes  int64     `json:"sizeBytes"`
	ModifiedAt time.Time `json:"modifiedAt"`
}

// ReadResult is the GET .../files/content response.
type ReadResult struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	SizeBytes int64  `json:"sizeBytes"`
}

// WriteResult is the PUT .../files/content response.
type WriteResult struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
}

// Download describes a file the handler streams to the client.
type Download struct {
	Path       string
	Name       string
	SizeBytes  int64
	ModifiedAt time.Time
}

// UploadedFile is one successfully stored multipart file.
type UploadedFile struct {
	Name      string `json:"name"`
	SizeBytes int64  `json:"sizeBytes"`
}

// Service coordinates file-manager operations for site webroots.
type Service struct {
	st    *store.Store
	audit *audit.Log
	cfg   config.Config
}

// New creates the file service.
func New(st *store.Store, auditLog *audit.Log, cfg config.Config) *Service {
	return &Service{st: st, audit: auditLog, cfg: cfg}
}

// dryRunErr is the frozen reply of every endpoint in dry-run mode.
func dryRunErr() error {
	return apierr.Conflict("dry_run", "file manager is disabled in dry-run mode")
}

// site resolves rawDomain to its normalized name and webroot.
func (s *Service) site(rawDomain string) (domain, root string, err error) {
	domain = strings.ToLower(strings.TrimSpace(rawDomain))
	site, ok := s.st.GetSite(domain)
	if !ok {
		return "", "", apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}
	return domain, filepath.Clean(site.Root), nil
}

// List returns the directory listing at rel (empty = webroot).
func (s *Service) List(domain, rel string) (string, []Entry, error) {
	if s.cfg.DryRun {
		return "", nil, dryRunErr()
	}
	_, root, err := s.site(domain)
	if err != nil {
		return "", nil, err
	}
	abs, info, err := resolvePath(root, rel, listOpts)
	if err != nil {
		return "", nil, err
	}
	if !info.IsDir() {
		return "", nil, apierr.BadRequest("not_a_directory", fmt.Sprintf("path %q is not a directory", rel))
	}
	dirents, err := os.ReadDir(abs)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", nil, notFoundPath(rel)
		}
		return "", nil, apierr.Internal(fmt.Sprintf("read directory %s: %v", abs, err))
	}
	entries := make([]Entry, 0, len(dirents))
	for _, de := range dirents {
		info, err := de.Info()
		if err != nil {
			continue // entry vanished between readdir and stat
		}
		entries = append(entries, Entry{
			Name:       de.Name(),
			Type:       entryType(de),
			SizeBytes:  info.Size(),
			ModifiedAt: info.ModTime().UTC().Truncate(time.Second),
		})
	}
	sortEntries(entries)
	return rel, entries, nil
}

// Read returns the UTF-8 content of a regular text file.
func (s *Service) Read(domain, rel string) (ReadResult, error) {
	if s.cfg.DryRun {
		return ReadResult{}, dryRunErr()
	}
	_, root, err := s.site(domain)
	if err != nil {
		return ReadResult{}, err
	}
	abs, info, err := resolvePath(root, rel, readOpts)
	if err != nil {
		return ReadResult{}, err
	}
	if !info.Mode().IsRegular() {
		return ReadResult{}, apierr.BadRequest("not_a_file", fmt.Sprintf("path %q is not a regular file", rel))
	}
	if info.Size() > maxTextBytes {
		return ReadResult{}, tooLarge(fmt.Sprintf("file is larger than %d bytes", maxTextBytes))
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return ReadResult{}, notFoundPath(rel)
		}
		return ReadResult{}, apierr.Internal(fmt.Sprintf("read %s: %v", abs, err))
	}
	if len(data) > maxTextBytes {
		return ReadResult{}, tooLarge(fmt.Sprintf("file is larger than %d bytes", maxTextBytes))
	}
	if !utf8.Valid(data) {
		return ReadResult{}, apierr.New(415, "not_text", "file is not valid UTF-8 text")
	}
	return ReadResult{Path: rel, Content: string(data), SizeBytes: int64(len(data))}, nil
}

// Write creates or overwrites a UTF-8 text file. The parent directory must
// exist; symlinks anywhere in the path are rejected.
func (s *Service) Write(domain, rel, content string) (WriteResult, error) {
	if s.cfg.DryRun {
		return WriteResult{}, dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return WriteResult{}, err
	}
	params := map[string]any{"domain": domain, "path": rel}
	if !utf8.ValidString(content) {
		return WriteResult{}, s.reject(ActionWrite, params, apierr.BadRequest("invalid_text", "content is not valid UTF-8"))
	}
	if len(content) > maxTextBytes {
		return WriteResult{}, s.reject(ActionWrite, params, tooLarge(fmt.Sprintf("content is larger than %d bytes", maxTextBytes)))
	}
	abs, info, err := resolvePath(root, rel, writeOpts)
	if err != nil {
		return WriteResult{}, s.reject(ActionWrite, params, err)
	}
	if info != nil && info.IsDir() {
		return WriteResult{}, s.reject(ActionWrite, params, apierr.Conflict("is_a_directory", fmt.Sprintf("path %q is a directory", rel)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionWrite, Params: params, Result: audit.ResultAccepted}); err != nil {
		return WriteResult{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		return WriteResult{}, apierr.Internal(fmt.Sprintf("write %s: %v", abs, err))
	}
	return WriteResult{Path: rel, SizeBytes: int64(len(content))}, nil
}

// Download validates a regular file and returns what the handler needs to
// stream it.
func (s *Service) Download(domain, rel string) (Download, error) {
	if s.cfg.DryRun {
		return Download{}, dryRunErr()
	}
	_, root, err := s.site(domain)
	if err != nil {
		return Download{}, err
	}
	abs, info, err := resolvePath(root, rel, readOpts)
	if err != nil {
		return Download{}, err
	}
	if info.IsDir() {
		return Download{}, apierr.New(413, "is_a_directory", fmt.Sprintf("path %q is a directory", rel))
	}
	if !info.Mode().IsRegular() {
		return Download{}, apierr.BadRequest("not_a_file", fmt.Sprintf("path %q is not a regular file", rel))
	}
	return Download{
		Path:       abs,
		Name:       filepath.Base(abs),
		SizeBytes:  info.Size(),
		ModifiedAt: info.ModTime(),
	}, nil
}

// Upload streams one multipart file into dir (empty = webroot). The target
// directory must exist; an existing file is only replaced with overwrite.
func (s *Service) Upload(domain, dir, rawName string, content io.Reader, overwrite bool) (UploadedFile, error) {
	if s.cfg.DryRun {
		return UploadedFile{}, dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return UploadedFile{}, err
	}
	name, err := sanitizeName(rawName)
	if err != nil {
		return UploadedFile{}, err
	}
	fileRel := name
	if dir != "" {
		fileRel = dir + "/" + name
	}
	params := map[string]any{"domain": domain, "path": fileRel, "name": name}
	if overwrite {
		params["overwrite"] = true
	}

	dirAbs, info, err := resolvePath(root, dir, readOpts)
	if err != nil {
		return UploadedFile{}, s.reject(ActionUpload, params, err)
	}
	if !info.IsDir() {
		return UploadedFile{}, s.reject(ActionUpload, params, apierr.BadRequest("not_a_directory", fmt.Sprintf("upload target %q is not a directory", dir)))
	}

	target := filepath.Join(dirAbs, name)
	if fi, err := os.Lstat(target); err == nil {
		switch {
		case fi.Mode()&fs.ModeSymlink != 0:
			return UploadedFile{}, s.reject(ActionUpload, params, apierr.Conflict("symlink", fmt.Sprintf("path %q is a symlink", fileRel)))
		case fi.IsDir():
			return UploadedFile{}, s.reject(ActionUpload, params, apierr.Conflict("is_a_directory", fmt.Sprintf("path %q is a directory", fileRel)))
		case !overwrite:
			return UploadedFile{}, s.reject(ActionUpload, params, apierr.Conflict("exists", fmt.Sprintf("file %q already exists", fileRel)))
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("stat %s: %v", target, err))
	}

	if err := s.audit.Append(audit.Record{Action: ActionUpload, Params: params, Result: audit.ResultAccepted}); err != nil {
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	tmp, err := os.CreateTemp(dirAbs, ".clouddeck-upload-*")
	if err != nil {
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("create upload file: %v", err))
	}
	tmpName := tmp.Name()
	n, err := io.CopyN(tmp, content, maxUploadBytes+1)
	if err == nil { // reached the cap + 1 byte
		tmp.Close()
		os.Remove(tmpName)
		return UploadedFile{}, s.reject(ActionUpload, params, tooLarge(fmt.Sprintf("file is larger than %d bytes", maxUploadBytes)))
	}
	if !errors.Is(err, io.EOF) {
		tmp.Close()
		os.Remove(tmpName)
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("write upload %q: %v", name, err))
	}
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("chmod upload %q: %v", name, err))
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("close upload %q: %v", name, err))
	}
	if err := os.Rename(tmpName, target); err != nil {
		os.Remove(tmpName)
		return UploadedFile{}, apierr.Internal(fmt.Sprintf("store upload %q: %v", name, err))
	}
	return UploadedFile{Name: name, SizeBytes: n}, nil
}

// Mkdir creates rel and any missing parents. The final directory may not
// exist yet; existing symlinks anywhere in the path are rejected.
func (s *Service) Mkdir(domain, rel string) (string, error) {
	if s.cfg.DryRun {
		return "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", err
	}
	params := map[string]any{"domain": domain, "path": rel}
	abs, info, err := resolvePath(root, rel, mkdirOpts)
	if err != nil {
		return "", s.reject(ActionMkdir, params, err)
	}
	if info != nil {
		return "", s.reject(ActionMkdir, params, apierr.Conflict("exists", fmt.Sprintf("path %q already exists", rel)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionMkdir, Params: params, Result: audit.ResultAccepted}); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return "", apierr.Internal(fmt.Sprintf("create directory %s: %v", abs, err))
	}
	return rel, nil
}

// Rename moves from to to inside the same webroot. Both paths get the full
// validation treatment; an absent to parent yields 404 parent_missing.
func (s *Service) Rename(domain, from, to string) (string, string, error) {
	if s.cfg.DryRun {
		return "", "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", "", err
	}
	params := map[string]any{"domain": domain, "from": from, "to": to}
	if from == "" || to == "" {
		return "", "", s.reject(ActionRename, params, apierr.BadRequest("invalid_path", "cannot rename the webroot itself"))
	}
	fromAbs, _, err := resolvePath(root, from, renameFromOpts)
	if err != nil {
		return "", "", s.reject(ActionRename, params, err)
	}
	toAbs, toInfo, err := resolvePath(root, to, renameToOpts)
	if err != nil {
		return "", "", s.reject(ActionRename, params, err)
	}
	if toInfo != nil {
		return "", "", s.reject(ActionRename, params, apierr.Conflict("to_exists", fmt.Sprintf("path %q already exists", to)))
	}
	if within(fromAbs, toAbs) {
		return "", "", s.reject(ActionRename, params, apierr.BadRequest("invalid_path", fmt.Sprintf("cannot move %q inside itself", from)))
	}
	if err := s.audit.Append(audit.Record{Action: ActionRename, Params: params, Result: audit.ResultAccepted}); err != nil {
		return "", "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := os.Rename(fromAbs, toAbs); err != nil {
		return "", "", apierr.Internal(fmt.Sprintf("rename %s: %v", fromAbs, err))
	}
	return from, to, nil
}

// Delete removes a file, symlink or directory. Non-empty directories need
// recursive=true; deleting the webroot itself is refused.
func (s *Service) Delete(domain, rel string, recursive bool) (string, error) {
	if s.cfg.DryRun {
		return "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", err
	}
	params := map[string]any{"domain": domain, "path": rel, "recursive": recursive}
	if rel == "" {
		return "", s.reject(ActionDelete, params, apierr.BadRequest("invalid_path", "cannot delete the webroot itself"))
	}
	abs, info, err := resolvePath(root, rel, deleteOpts)
	if err != nil {
		return "", s.reject(ActionDelete, params, err)
	}
	if info.IsDir() && !recursive {
		entries, err := os.ReadDir(abs)
		if err != nil {
			return "", apierr.Internal(fmt.Sprintf("read directory %s: %v", abs, err))
		}
		if len(entries) > 0 {
			return "", s.reject(ActionDelete, params, apierr.Conflict("not_empty", fmt.Sprintf("directory %q is not empty", rel)))
		}
	}
	if err := s.audit.Append(audit.Record{Action: ActionDelete, Params: params, Result: audit.ResultAccepted}); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if info.IsDir() && recursive {
		err = os.RemoveAll(abs)
	} else {
		err = os.Remove(abs)
	}
	if err != nil {
		return "", apierr.Internal(fmt.Sprintf("delete %s: %v", abs, err))
	}
	return rel, nil
}

// reject records a refused mutation (best effort) and returns err unchanged.
func (s *Service) reject(action string, params map[string]any, err error) error {
	if auditErr := s.audit.Append(audit.Record{Action: action, Params: params, Result: audit.ResultRejected, Error: err.Error()}); auditErr != nil {
		stdlog.Printf("files: write audit log: %v", auditErr)
	}
	return err
}

func tooLarge(message string) error {
	return apierr.New(413, "too_large", message)
}

func entryType(de fs.DirEntry) string {
	switch {
	case de.Type()&fs.ModeSymlink != 0:
		return "symlink"
	case de.IsDir():
		return "dir"
	default:
		return "file"
	}
}

// sortEntries orders directories first, then case-insensitive name.
func sortEntries(entries []Entry) {
	sort.Slice(entries, func(i, j int) bool {
		di, dj := entries[i].Type == "dir", entries[j].Type == "dir"
		if di != dj {
			return di
		}
		li, lj := strings.ToLower(entries[i].Name), strings.ToLower(entries[j].Name)
		if li != lj {
			return li < lj
		}
		return entries[i].Name < entries[j].Name
	})
}
