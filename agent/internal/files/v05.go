// v0.5 file-manager additions: chmod, copy, compress and extract.
// See docs/api.md section 1.9.
package files

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

// Audit actions for the v0.5 file operations.
const (
	ActionChmod    = "files.chmod"
	ActionCopy     = "files.copy"
	ActionCompress = "files.compress"
	ActionExtract  = "files.extract"
)

// maxArchivePaths caps the number of sources one compress call may take.
const maxArchivePaths = 50

// Bulk-operation caps from docs/api.md section 1.9. They are vars (not
// consts) so tests can lower them.
var (
	maxBulkBytes   int64 = 500 << 20 // total payload per copy/archive operation
	maxBulkEntries int64 = 20000     // entries per copy/archive operation
)

// errBulkLimit marks an operation that crossed maxBulkBytes or
// maxBulkEntries; callers map it onto the frozen 413 too_large reply.
var errBulkLimit = errors.New("bulk operation limit exceeded")

// Option sets for the v0.5 operations. The frozen 404 code for a missing
// path is file_not_found. resolvePath admits final symlinks here so each
// operation can refuse them with its own error code; symlinks deeper in the
// path still fail resolution with 409 symlink.
var (
	chmodOpts          = resolveOpts{allowFinalSymlink: true, missing: fileNotFound}
	copyFromOpts       = resolveOpts{allowFinalSymlink: true, missing: fileNotFound}
	copyToOpts         = resolveOpts{allowMissingFinal: true, allowFinalSymlink: true, missing: fileNotFound}
	compressSrcOpts    = resolveOpts{allowFinalSymlink: true, missing: fileNotFound}
	compressTargetOpts = resolveOpts{allowMissingFinal: true, allowFinalSymlink: true, missing: fileNotFound}
	extractSrcOpts     = resolveOpts{allowFinalSymlink: true, missing: fileNotFound}
	extractDestOpts    = resolveOpts{allowMissing: true, allowFinalSymlink: true, missing: fileNotFound}
)

// Frozen v0.5 error constructors.

func fileNotFound(rel string) error {
	return apierr.NotFound("file_not_found", fmt.Sprintf("path %q does not exist", rel))
}

func fileExists(rel string) error {
	return apierr.Conflict("file_exists", fmt.Sprintf("path %q already exists", rel))
}

func invalidSymlink(rel string) error {
	return apierr.BadRequest("invalid_path", fmt.Sprintf("path %q is a symlink", rel))
}

func invalidMode(mode string) error {
	return apierr.BadRequest("invalid_mode", fmt.Sprintf("mode %q is not an octal permission such as \"644\" or \"0755\"", mode))
}

func invalidFormat(format string) error {
	return apierr.BadRequest("invalid_format", fmt.Sprintf("format %q is not \"tar.gz\" or \"zip\"", format))
}

func invalidArchive(message string) error {
	return apierr.BadRequest("invalid_archive", message)
}

func tooLargeCap() error {
	return tooLarge(fmt.Sprintf("operation exceeds the %d byte / %d entry limit", maxBulkBytes, maxBulkEntries))
}

// bulkBudget tracks the shared per-operation caps.
type bulkBudget struct {
	bytes   int64
	entries int64
}

// entry charges one filesystem or archive entry.
func (b *bulkBudget) entry() error {
	b.entries++
	if b.entries > maxBulkEntries {
		return errBulkLimit
	}
	return nil
}

// add charges n bytes.
func (b *bulkBudget) add(n int64) error {
	b.bytes += n
	if b.bytes > maxBulkBytes {
		return errBulkLimit
	}
	return nil
}

// copyWithBudget streams src into dst while enforcing the byte cap.
func copyWithBudget(dst io.Writer, src io.Reader, budget *bulkBudget) error {
	buf := make([]byte, 64<<10)
	for {
		n, err := src.Read(buf)
		if n > 0 {
			if budget.bytes+int64(n) > maxBulkBytes {
				return errBulkLimit
			}
			if _, werr := dst.Write(buf[:n]); werr != nil {
				return werr
			}
			budget.bytes += int64(n)
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

// Chmod sets one entry's permission bits. mode is octal ("644" or "0755");
// symlinks are refused.
func (s *Service) Chmod(domain, rel, mode string) (string, error) {
	if s.cfg.DryRun {
		return "", dryRunErr()
	}
	params := map[string]any{"path": rel, "mode": mode}
	perm, err := parseChmodMode(mode)
	if err != nil {
		return "", s.reject(ActionChmod, params, err)
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", err
	}
	params["domain"] = domain
	abs, info, err := resolvePath(root, rel, chmodOpts)
	if err != nil {
		return "", s.reject(ActionChmod, params, err)
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return "", s.reject(ActionChmod, params, invalidSymlink(rel))
	}
	if err := s.audit.Append(auditAccepted(ActionChmod, params)); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := os.Chmod(abs, perm); err != nil {
		return "", apierr.Internal(fmt.Sprintf("chmod %s: %v", abs, err))
	}
	return rel, nil
}

// parseChmodMode parses the frozen ^[0-7]{3,4}$ octal mode string into an
// fs.FileMode, mapping the traditional setuid/setgid/sticky digit onto the
// separate fs.FileMode bits.
func parseChmodMode(mode string) (fs.FileMode, error) {
	if len(mode) != 3 && len(mode) != 4 {
		return 0, invalidMode(mode)
	}
	v, err := strconv.ParseUint(mode, 8, 32)
	if err != nil {
		return 0, invalidMode(mode)
	}
	perm := fs.FileMode(v & 0o777)
	if len(mode) == 4 {
		if v&0o4000 != 0 {
			perm |= fs.ModeSetuid
		}
		if v&0o2000 != 0 {
			perm |= fs.ModeSetgid
		}
		if v&0o1000 != 0 {
			perm |= fs.ModeSticky
		}
	}
	return perm, nil
}

// dirMode remembers a source directory's permission bits for the deferred
// chmod pass at the end of a copy.
type dirMode struct {
	abs  string
	mode fs.FileMode
}

// scanTree charges every entry below root against budget (symlinks are
// counted but contribute no bytes) and returns the directory modes in walk
// order (parents first).
func scanTree(root string, budget *bulkBudget) ([]dirMode, error) {
	var dirs []dirMode
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if err := budget.entry(); err != nil {
			return err
		}
		if d.IsDir() {
			if info, ierr := d.Info(); ierr == nil {
				dirs = append(dirs, dirMode{abs: p, mode: info.Mode().Perm()})
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		info, ierr := d.Info()
		if ierr != nil {
			return nil // entry vanished while scanning
		}
		if info.Mode().IsRegular() {
			return budget.add(info.Size())
		}
		return nil
	})
	return dirs, err
}

// Copy duplicates from -> to inside the site root. overwrite replaces an
// existing target; symlinks are refused. Returns the normalized from/to.
func (s *Service) Copy(domain, from, to string, overwrite bool) (string, string, error) {
	if s.cfg.DryRun {
		return "", "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", "", err
	}
	params := map[string]any{"domain": domain, "from": from, "to": to}
	if overwrite {
		params["overwrite"] = true
	}
	fromAbs, fromInfo, err := resolvePath(root, from, copyFromOpts)
	if err != nil {
		return "", "", s.reject(ActionCopy, params, err)
	}
	if fromInfo.Mode()&fs.ModeSymlink != 0 {
		return "", "", s.reject(ActionCopy, params, invalidSymlink(from))
	}
	if to == "" {
		return "", "", s.reject(ActionCopy, params, apierr.BadRequest("invalid_path", "cannot copy over the webroot itself"))
	}
	toAbs, toInfo, err := resolvePath(root, to, copyToOpts)
	if err != nil {
		return "", "", s.reject(ActionCopy, params, err)
	}
	if toInfo != nil && toInfo.Mode()&fs.ModeSymlink != 0 {
		return "", "", s.reject(ActionCopy, params, invalidSymlink(to))
	}
	if within(fromAbs, toAbs) {
		return "", "", s.reject(ActionCopy, params, apierr.BadRequest("invalid_path", fmt.Sprintf("cannot copy %q into itself", from)))
	}
	if toInfo != nil && !overwrite {
		return "", "", s.reject(ActionCopy, params, fileExists(to))
	}

	// Pre-flight the caps so an oversized tree never creates a partial
	// target.
	dirs, err := scanTree(fromAbs, &bulkBudget{})
	if err != nil {
		return "", "", s.reject(ActionCopy, params, copyScanErr(err))
	}
	if err := s.audit.Append(auditAccepted(ActionCopy, params)); err != nil {
		return "", "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if toInfo != nil {
		if err := os.RemoveAll(toAbs); err != nil {
			return "", "", apierr.Internal(fmt.Sprintf("remove existing %s: %v", toAbs, err))
		}
	}
	if err := copyTree(fromAbs, toAbs, fromInfo, dirs, &bulkBudget{}); err != nil {
		os.RemoveAll(toAbs) // never leave a half copy behind
		return "", "", s.reject(ActionCopy, params, copyScanErr(err))
	}
	return from, to, nil
}

// copyScanErr maps scan/copy failures onto their frozen replies.
func copyScanErr(err error) error {
	if errors.Is(err, errBulkLimit) {
		return tooLargeCap()
	}
	if apiErr, ok := apierr.As(err); ok {
		return apiErr
	}
	return apierr.Internal(fmt.Sprintf("copy: %v", err))
}

// copyTree copies the file or directory at src to dst. Symlink and other
// non-regular entries are skipped, file modes are preserved via an explicit
// chmod and the src directory modes are applied deepest-first at the end so
// read-only directories do not block writing their children.
func copyTree(src, dst string, srcInfo fs.FileInfo, dirs []dirMode, budget *bulkBudget) error {
	if !srcInfo.IsDir() {
		return copyFile(src, dst, srcInfo.Mode().Perm(), budget)
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	if err := copyWalk(src, dst, budget); err != nil {
		return err
	}
	for i := len(dirs) - 1; i >= 0; i-- {
		rel, err := filepath.Rel(src, dirs[i].abs)
		if err != nil {
			return err
		}
		if err := os.Chmod(filepath.Join(dst, rel), dirs[i].mode); err != nil {
			return err
		}
	}
	return nil
}

// copyWalk copies every regular file under src into the mirrored tree at dst.
func copyWalk(src, dst string, budget *bulkBudget) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == src {
			return nil // dst is created by the caller
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		switch {
		case d.Type()&fs.ModeSymlink != 0:
			return nil // never follow or recreate links
		case d.IsDir():
			return os.MkdirAll(target, 0o755)
		}
		if err := budget.entry(); err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil // sockets, devices, ...
		}
		return copyFile(p, target, info.Mode().Perm(), budget)
	})
}

// copyFile streams one regular file and preserves its permission bits.
func copyFile(src, dst string, mode fs.FileMode, budget *bulkBudget) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if err := out.Chmod(mode); err != nil {
		out.Close()
		return err
	}
	if err := copyWithBudget(out, in, budget); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// Compress archives every path (files or directories, recursively) into
// target — format "tar.gz" or "zip". target must not exist yet.
func (s *Service) Compress(domain string, paths []string, format, target string) (string, error) {
	if s.cfg.DryRun {
		return "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", err
	}
	params := map[string]any{"domain": domain, "paths": paths, "format": format, "target": target}
	if len(paths) == 0 || len(paths) > maxArchivePaths {
		return "", s.reject(ActionCompress, params, apierr.BadRequest("invalid_path", fmt.Sprintf("paths must hold between 1 and %d entries", maxArchivePaths)))
	}
	srcs := make([]string, 0, len(paths))
	for _, rel := range paths {
		abs, info, err := resolvePath(root, rel, compressSrcOpts)
		if err != nil {
			return "", s.reject(ActionCompress, params, err)
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return "", s.reject(ActionCompress, params, invalidSymlink(rel))
		}
		srcs = append(srcs, abs)
	}
	switch format {
	case "tar.gz", "zip":
	default:
		return "", s.reject(ActionCompress, params, invalidFormat(format))
	}
	targetAbs, targetInfo, err := resolvePath(root, target, compressTargetOpts)
	if err != nil {
		return "", s.reject(ActionCompress, params, err)
	}
	if targetInfo != nil {
		if targetInfo.Mode()&fs.ModeSymlink != 0 {
			return "", s.reject(ActionCompress, params, invalidSymlink(target))
		}
		return "", s.reject(ActionCompress, params, fileExists(target))
	}

	// Pre-flight the caps so an oversized tree never creates a partial
	// archive.
	budget := &bulkBudget{}
	for _, abs := range srcs {
		if _, err := scanTree(abs, budget); err != nil {
			return "", s.reject(ActionCompress, params, archiveErr(err))
		}
	}
	if err := s.audit.Append(auditAccepted(ActionCompress, params)); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := writeArchive(targetAbs, root, srcs, format); err != nil {
		return "", s.reject(ActionCompress, params, archiveErr(err))
	}
	return target, nil
}

// archiveErr maps archive-building failures onto their frozen replies.
func archiveErr(err error) error {
	if errors.Is(err, errBulkLimit) {
		return tooLargeCap()
	}
	if apiErr, ok := apierr.As(err); ok {
		return apiErr
	}
	return apierr.Internal(fmt.Sprintf("archive: %v", err))
}

// archiveWriter is the shared surface of the tar.gz and zip writers.
type archiveWriter interface {
	writeDir(rel string, info fs.FileInfo) error
	writeFile(rel, src string, info fs.FileInfo, budget *bulkBudget) error
}

// writeArchive streams srcs (absolute paths under root) into a fresh target
// using format "tar.gz" or "zip". A failed or partial archive is removed.
func writeArchive(target, root string, srcs []string, format string) error {
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	keep := false
	defer func() {
		if !keep {
			f.Close()
			os.Remove(target)
		}
	}()
	if err := f.Chmod(0o644); err != nil {
		return err
	}

	var aw archiveWriter
	var finish func() error
	switch format {
	case "tar.gz":
		gz := gzip.NewWriter(f)
		tw := tar.NewWriter(gz)
		aw = &tarArchive{tw: tw}
		finish = func() error {
			if err := tw.Close(); err != nil {
				return err
			}
			return gz.Close()
		}
	default: // "zip"
		zw := zip.NewWriter(f)
		aw = &zipArchive{zw: zw}
		finish = zw.Close
	}

	budget := &bulkBudget{}
	for _, abs := range srcs {
		if err := walkIntoArchive(abs, root, target, aw, budget); err != nil {
			return err
		}
	}
	if err := finish(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	keep = true
	return nil
}

// walkIntoArchive adds the tree at abs, named relative to root, to aw.
// Symlink and other non-regular entries are skipped and the target archive
// itself is never packed.
func walkIntoArchive(abs, root, target string, aw archiveWriter, budget *bulkBudget) error {
	return filepath.WalkDir(abs, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil // the walked root itself has no archive name
		}
		if p == target {
			return nil // never pack the archive we are writing
		}
		if err := budget.entry(); err != nil {
			return err
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		switch {
		case info.IsDir():
			return aw.writeDir(filepath.ToSlash(rel), info)
		case info.Mode().IsRegular():
			return aw.writeFile(filepath.ToSlash(rel), p, info, budget)
		default:
			return nil // sockets, devices, ...
		}
	})
}

// tarArchive writes a gzip tar stream.
type tarArchive struct {
	tw *tar.Writer
}

func (a *tarArchive) writeDir(rel string, info fs.FileInfo) error {
	return a.tw.WriteHeader(&tar.Header{
		Name:     rel + "/",
		Typeflag: tar.TypeDir,
		Mode:     int64(info.Mode().Perm()),
		ModTime:  info.ModTime(),
	})
}

func (a *tarArchive) writeFile(rel, src string, info fs.FileInfo, budget *bulkBudget) error {
	hdr, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	hdr.Name = rel
	if err := a.tw.WriteHeader(hdr); err != nil {
		return err
	}
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	return copyWithBudget(a.tw, f, budget)
}

// zipArchive writes a zip stream.
type zipArchive struct {
	zw *zip.Writer
}

func (a *zipArchive) writeDir(rel string, info fs.FileInfo) error {
	hdr := &zip.FileHeader{Name: rel + "/", Method: zip.Store, Modified: info.ModTime()}
	hdr.SetMode(info.Mode().Perm() | fs.ModeDir)
	_, err := a.zw.CreateHeader(hdr)
	return err
}

func (a *zipArchive) writeFile(rel, src string, info fs.FileInfo, budget *bulkBudget) error {
	hdr, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	hdr.Name = rel
	hdr.Method = zip.Deflate
	w, err := a.zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	return copyWithBudget(w, f, budget)
}

// Extract unpacks archive (".tar.gz", ".tgz" or ".zip") into dest, which must
// be an existing directory or is created. Archive entries that would escape
// dest are rejected; symlink entries are skipped.
func (s *Service) Extract(domain, archive, dest string) (string, error) {
	if s.cfg.DryRun {
		return "", dryRunErr()
	}
	domain, root, err := s.site(domain)
	if err != nil {
		return "", err
	}
	params := map[string]any{"domain": domain, "archive": archive, "dest": dest}
	arcAbs, arcInfo, err := resolvePath(root, archive, extractSrcOpts)
	if err != nil {
		return "", s.reject(ActionExtract, params, err)
	}
	if arcInfo.Mode()&fs.ModeSymlink != 0 {
		return "", s.reject(ActionExtract, params, invalidSymlink(archive))
	}
	if !arcInfo.Mode().IsRegular() {
		return "", s.reject(ActionExtract, params, fileNotFound(archive))
	}
	format, ok := archiveFormat(archive)
	if !ok {
		return "", s.reject(ActionExtract, params, invalidArchive(fmt.Sprintf("cannot detect the format of %q; expected .tar.gz, .tgz or .zip", archive)))
	}
	destAbs, destInfo, err := resolvePath(root, dest, extractDestOpts)
	if err != nil {
		return "", s.reject(ActionExtract, params, err)
	}
	if destInfo != nil {
		if destInfo.Mode()&fs.ModeSymlink != 0 {
			return "", s.reject(ActionExtract, params, invalidSymlink(dest))
		}
		if !destInfo.IsDir() {
			return "", s.reject(ActionExtract, params, apierr.BadRequest("invalid_path", fmt.Sprintf("extract destination %q is not a directory", dest)))
		}
	} else if err := os.MkdirAll(destAbs, 0o755); err != nil {
		return "", apierr.Internal(fmt.Sprintf("create destination %s: %v", destAbs, err))
	}

	f, err := os.Open(arcAbs)
	if err != nil {
		return "", apierr.Internal(fmt.Sprintf("open archive %s: %v", arcAbs, err))
	}
	defer f.Close()

	var extract func() error
	switch {
	case format == "zip":
		zr, err := zip.NewReader(f, arcInfo.Size())
		if err != nil {
			return "", s.reject(ActionExtract, params, invalidArchive(fmt.Sprintf("invalid zip archive %q: %v", archive, err)))
		}
		if err := validateZip(zr, destAbs, &bulkBudget{}); err != nil {
			return "", s.reject(ActionExtract, params, extractErr(err))
		}
		extract = func() error { return extractZip(zr, destAbs, &bulkBudget{}) }
	default: // "tar.gz"
		extract = func() error {
			gz, err := gzip.NewReader(f)
			if err != nil {
				return err
			}
			defer gz.Close()
			return extractTar(tar.NewReader(gz), destAbs, &bulkBudget{})
		}
	}
	if err := s.audit.Append(auditAccepted(ActionExtract, params)); err != nil {
		return "", apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	if err := extract(); err != nil {
		return "", s.reject(ActionExtract, params, extractErr(err))
	}
	return dest, nil
}

// extractErr maps unpacking failures onto their frozen replies.
func extractErr(err error) error {
	if errors.Is(err, errBulkLimit) {
		return tooLargeCap()
	}
	if apiErr, ok := apierr.As(err); ok {
		return apiErr
	}
	return invalidArchive(fmt.Sprintf("extract: %v", err))
}

// archiveFormat detects the extraction format from the archive name.
func archiveFormat(rel string) (string, bool) {
	name := strings.ToLower(path.Base(rel))
	switch {
	case strings.HasSuffix(name, ".tar.gz"), strings.HasSuffix(name, ".tgz"):
		return "tar.gz", true
	case strings.HasSuffix(name, ".zip"):
		return "zip", true
	default:
		return "", false
	}
}

// extractTarget maps one archive entry name onto a path inside destAbs.
// Escaping names are refused; the root entry (".") yields "" and is skipped
// by the caller.
func extractTarget(destAbs, name string) (string, error) {
	if name == "" || strings.ContainsRune(name, 0) {
		return "", invalidArchive(fmt.Sprintf("archive entry has an invalid name %q", name))
	}
	// Treat backslashes as separators too: no archive may smuggle a
	// directory traversal past the clean/prefix check below.
	cleaned := path.Clean(strings.ReplaceAll(name, `\`, "/"))
	if cleaned == "." {
		return "", nil
	}
	if path.IsAbs(cleaned) || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", invalidArchive(fmt.Sprintf("archive entry %q escapes the extraction directory", name))
	}
	target := filepath.Join(destAbs, filepath.FromSlash(cleaned))
	if !within(destAbs, target) {
		return "", invalidArchive(fmt.Sprintf("archive entry %q escapes the extraction directory", name))
	}
	return target, nil
}

// ensureExtractPath refuses a pre-existing symlink anywhere on target's path
// below destAbs, so lenient MkdirAll/OpenFile calls cannot be redirected
// outside the destination. With wantDir the final component must be a real
// directory as well; for regular files an existing plain file may be
// overwritten.
func ensureExtractPath(destAbs, target string, wantDir bool) error {
	rel, err := filepath.Rel(destAbs, target)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("resolve %s: %v", target, err))
	}
	if rel == "." {
		return nil
	}
	parts := strings.Split(rel, string(filepath.Separator))
	cur := destAbs
	for i, part := range parts {
		cur = filepath.Join(cur, part)
		info, err := os.Lstat(cur)
		if errors.Is(err, fs.ErrNotExist) {
			return nil // nothing below a missing component exists
		}
		if err != nil {
			return apierr.Internal(fmt.Sprintf("stat %s: %v", cur, err))
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return apierr.Conflict("symlink", fmt.Sprintf("path %q is a symlink", strings.Join(parts[:i+1], "/")))
		}
		if i < len(parts)-1 && !info.IsDir() {
			return apierr.Conflict("exists", fmt.Sprintf("path %q exists and is not a directory", strings.Join(parts[:i+1], "/")))
		}
		if wantDir && i == len(parts)-1 && !info.IsDir() {
			return apierr.Conflict("exists", fmt.Sprintf("path %q exists and is not a directory", strings.Join(parts[:i+1], "/")))
		}
	}
	return nil
}

// extractTar unpacks a tar stream into destAbs, skipping symlink and hardlink
// entries.
func extractTar(tr *tar.Reader, destAbs string, budget *bulkBudget) error {
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := budget.entry(); err != nil {
			return err
		}
		target, err := extractTarget(destAbs, hdr.Name)
		if err != nil {
			return err
		}
		if target == "" {
			continue
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := mkdirExtract(destAbs, target); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			mode := fs.FileMode(hdr.Mode).Perm()
			if mode == 0 {
				mode = 0o644
			}
			if err := writeExtractFile(destAbs, target, tr, mode, budget); err != nil {
				return err
			}
		default:
			// Symlinks, hardlinks, devices and the like are never
			// recreated: they could point outside the destination.
		}
	}
}

// validateZip checks every central-directory entry before extraction so a
// malicious archive is refused before anything is written.
func validateZip(zr *zip.Reader, destAbs string, budget *bulkBudget) error {
	for _, f := range zr.File {
		if err := budget.entry(); err != nil {
			return err
		}
		if _, err := extractTarget(destAbs, f.Name); err != nil {
			return err
		}
		if f.Mode()&fs.ModeSymlink != 0 || f.FileInfo().IsDir() {
			continue
		}
		if f.UncompressedSize64 > uint64(maxBulkBytes) {
			return errBulkLimit
		}
		if err := budget.add(int64(f.UncompressedSize64)); err != nil {
			return err
		}
	}
	return nil
}

// extractZip unpacks a validated zip archive into destAbs, skipping symlink
// entries.
func extractZip(zr *zip.Reader, destAbs string, budget *bulkBudget) error {
	for _, f := range zr.File {
		if err := budget.entry(); err != nil {
			return err
		}
		target, err := extractTarget(destAbs, f.Name)
		if err != nil {
			return err
		}
		if target == "" || f.Mode()&fs.ModeSymlink != 0 {
			continue
		}
		if f.FileInfo().IsDir() {
			if err := mkdirExtract(destAbs, target); err != nil {
				return err
			}
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		mode := f.Mode().Perm()
		if mode == 0 {
			mode = 0o644
		}
		err = writeExtractFile(destAbs, target, rc, mode, budget)
		if closeErr := rc.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// mkdirExtract creates a destination directory, refusing to traverse
// pre-existing symlinks.
func mkdirExtract(destAbs, target string) error {
	if err := ensureExtractPath(destAbs, target, true); err != nil {
		return err
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return apierr.Internal(fmt.Sprintf("create directory %s: %v", target, err))
	}
	return nil
}

// writeExtractFile creates one extracted file with its archived permission
// bits, refusing pre-existing symlinks on its path.
func writeExtractFile(destAbs, target string, src io.Reader, mode fs.FileMode, budget *bulkBudget) error {
	if err := ensureExtractPath(destAbs, target, false); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return apierr.Internal(fmt.Sprintf("create directory %s: %v", filepath.Dir(target), err))
	}
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("create file %s: %v", target, err))
	}
	if err := out.Chmod(mode); err != nil {
		out.Close()
		return apierr.Internal(fmt.Sprintf("chmod file %s: %v", target, err))
	}
	if err := copyWithBudget(out, src, budget); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return apierr.Internal(fmt.Sprintf("close file %s: %v", target, err))
	}
	return nil
}

// auditAccepted is a tiny constructor used by the v0.5 operations.
func auditAccepted(action string, params map[string]any) audit.Record {
	return audit.Record{Action: action, Params: params, Result: audit.ResultAccepted}
}
