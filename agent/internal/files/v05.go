// v0.5 file-manager additions: chmod, copy, compress and extract.
// See docs/api.md section 1.9.
package files

import "clouddeck/agent/internal/apierr"

// Audit actions for the v0.5 file operations.
const (
	ActionChmod    = "files.chmod"
	ActionCopy     = "files.copy"
	ActionCompress = "files.compress"
	ActionExtract  = "files.extract"
)

// Chmod sets one entry's permission bits. mode is octal ("644" or "0755");
// symlinks are refused.
func (s *Service) Chmod(domain, rel, mode string) (string, error) {
	return "", apierr.Internal("files: not implemented")
}

// Copy duplicates from -> to inside the site root. overwrite replaces an
// existing target; symlinks are refused. Returns the normalized from/to.
func (s *Service) Copy(domain, from, to string, overwrite bool) (string, string, error) {
	return "", "", apierr.Internal("files: not implemented")
}

// Compress archives every path (files or directories, recursively) into
// target — format "tar.gz" or "zip". target must not exist yet.
func (s *Service) Compress(domain string, paths []string, format, target string) (string, error) {
	return "", apierr.Internal("files: not implemented")
}

// Extract unpacks archive (".tar.gz", ".tgz" or ".zip") into dest, which must
// be an existing directory or is created. Archive entries that would escape
// dest are rejected; symlink entries are skipped.
func (s *Service) Extract(domain, archive, dest string) (string, error) {
	return "", apierr.Internal("files: not implemented")
}
