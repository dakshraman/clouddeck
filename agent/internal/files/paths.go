package files

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"

	"clouddeck/agent/internal/apierr"
)

// resolveOpts tunes how resolvePath treats absent components and symlinks.
type resolveOpts struct {
	// allowMissing permits any component to be absent; the full path is
	// still returned so the caller can create it (mkdir).
	allowMissing bool
	// allowMissingFinal permits only the final component to be absent
	// (write, rename target).
	allowMissingFinal bool
	// allowFinalSymlink permits a symlink as the final component (list,
	// delete). The link is never followed.
	allowFinalSymlink bool
	// missing builds the 404 error for an absent or blocked path.
	missing func(rel string) error
}

// Ready-made option sets for the file-manager operations.
var (
	listOpts       = resolveOpts{allowFinalSymlink: true, missing: notFoundPath}
	readOpts       = resolveOpts{missing: notFoundPath}
	writeOpts      = resolveOpts{allowMissingFinal: true, missing: parentMissing}
	mkdirOpts      = resolveOpts{allowMissing: true, missing: notFoundPath}
	deleteOpts     = resolveOpts{allowFinalSymlink: true, missing: notFoundPath}
	renameFromOpts = resolveOpts{missing: fromMissing}
	renameToOpts   = resolveOpts{allowMissingFinal: true, missing: parentMissing}
)

func notFoundPath(rel string) error {
	return apierr.NotFound("not_found", fmt.Sprintf("path %q does not exist", rel))
}

func parentMissing(rel string) error {
	return apierr.NotFound("parent_missing", fmt.Sprintf("parent directory of %q does not exist", rel))
}

func fromMissing(rel string) error {
	return apierr.NotFound("from_missing", fmt.Sprintf("source %q does not exist", rel))
}

func invalidPath(rel string) error {
	return apierr.BadRequest("invalid_path", fmt.Sprintf("invalid path %q", rel))
}

// validatePath enforces the frozen path rules from docs/api.md section 1.1:
// slash-separated, relative, no leading slash, no backslashes, no NUL bytes,
// no empty/"."/".." segments and at most 1024 bytes. The empty string denotes
// the webroot itself.
func validatePath(rel string) error {
	if len(rel) > maxPathLen {
		return apierr.BadRequest("invalid_path", fmt.Sprintf("path is longer than %d bytes", maxPathLen))
	}
	if rel == "" {
		return nil
	}
	if strings.HasPrefix(rel, "/") {
		return invalidPath(rel)
	}
	if strings.ContainsAny(rel, "\\\x00") {
		return invalidPath(rel)
	}
	for _, seg := range strings.Split(rel, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return invalidPath(rel)
		}
	}
	return nil
}

// resolvePath validates rel, joins it under root, verifies containment and
// walks every component below root with os.Lstat, rejecting symlinks. It
// returns the absolute path and the final component's FileInfo (nil when the
// final component is absent and opts allows it). The webroot itself is
// trusted and never Lstat-checked for symlinks.
func resolvePath(root, rel string, opts resolveOpts) (string, fs.FileInfo, error) {
	if err := validatePath(rel); err != nil {
		return "", nil, err
	}
	root = filepath.Clean(root)

	var abs string
	var comps []string
	if rel == "" {
		abs = root
	} else {
		comps = strings.Split(rel, "/")
		abs = filepath.Join(root, filepath.FromSlash(rel))
		if !within(root, abs) {
			return "", nil, invalidPath(rel)
		}
	}

	if len(comps) == 0 {
		return lstatFinal(root, root, rel, opts)
	}
	for i := range comps {
		part := filepath.Join(root, filepath.Join(comps[:i+1]...))
		info, err := os.Lstat(part)
		if err != nil {
			if !errors.Is(err, fs.ErrNotExist) {
				return "", nil, apierr.Internal(fmt.Sprintf("stat %s: %v", part, err))
			}
			if opts.allowMissing || (opts.allowMissingFinal && i == len(comps)-1) {
				return abs, nil, nil
			}
			return "", nil, opts.missing(rel)
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			if opts.allowFinalSymlink && i == len(comps)-1 {
				return abs, info, nil
			}
			return "", nil, apierr.Conflict("symlink", fmt.Sprintf("path %q contains symlink %q", rel, strings.Join(comps[:i+1], "/")))
		}
		if i < len(comps)-1 && !info.IsDir() {
			if opts.allowMissing {
				return "", nil, apierr.Conflict("exists", fmt.Sprintf("path %q exists and is not a directory", strings.Join(comps[:i+1], "/")))
			}
			return "", nil, opts.missing(rel)
		}
		if i == len(comps)-1 {
			return abs, info, nil
		}
	}
	return abs, nil, nil // unreachable: every branch above returns
}

// lstatFinal handles the webroot-as-target case (rel == "").
func lstatFinal(root, abs, rel string, opts resolveOpts) (string, fs.FileInfo, error) {
	info, err := os.Lstat(root)
	if err == nil {
		return abs, info, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return "", nil, apierr.Internal(fmt.Sprintf("stat %s: %v", root, err))
	}
	if opts.allowMissing || opts.allowMissingFinal {
		return abs, nil, nil
	}
	return "", nil, opts.missing(rel)
}

// within reports whether abs equals root or sits inside it.
func within(root, abs string) bool {
	if abs == root {
		return true
	}
	sep := string(filepath.Separator)
	prefix := root
	if !strings.HasSuffix(prefix, sep) {
		prefix += sep
	}
	return strings.HasPrefix(abs, prefix)
}

// sanitizeName reduces a client-supplied multipart filename to a safe base
// name ("a/b/../x.txt" -> "x.txt"). It returns a 400 bad_name error for
// empty, "."/"..", root-only or NUL-bearing names.
func sanitizeName(raw string) (string, error) {
	base := path.Base(strings.ReplaceAll(raw, "\\", "/"))
	if base == "" || base == "." || base == ".." || base == "/" || strings.ContainsRune(base, '\x00') {
		return "", apierr.BadRequest("bad_name", fmt.Sprintf("invalid file name %q", raw))
	}
	if len(base) > 255 {
		return "", apierr.BadRequest("bad_name", fmt.Sprintf("file name %q is too long", raw))
	}
	return base, nil
}
