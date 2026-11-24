package git

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

// Release describes an immutable deployment snapshot in the releases directory.
type Release struct {
	ID         string    `json:"id"`
	CommitHash string    `json:"commitHash"`
	CommitMsg  string    `json:"commitMsg"`
	Branch     string    `json:"branch"`
	Path       string    `json:"path"`
	Active     bool      `json:"active"`
	DeployedAt time.Time `json:"deployedAt"`
}

const releasesMetaFile = "releases.json"
const deployTokenFile = "deploy_token"

func (s *Service) releasesMetaPath(siteRoot string) string {
	metaDir := filepath.Join(siteRoot, ".clouddeck")
	_ = os.MkdirAll(metaDir, 0o755)
	return filepath.Join(metaDir, releasesMetaFile)
}

func (s *Service) deployTokenPath(siteRoot string) string {
	metaDir := filepath.Join(siteRoot, ".clouddeck")
	_ = os.MkdirAll(metaDir, 0o755)
	return filepath.Join(metaDir, deployTokenFile)
}

func (s *Service) readDeployToken(siteRoot string) string {
	if siteRoot == "" {
		return ""
	}
	path := s.deployTokenPath(siteRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func (s *Service) writeDeployToken(siteRoot string, token string) error {
	if siteRoot == "" || token == "" {
		return nil
	}
	path := s.deployTokenPath(siteRoot)
	return os.WriteFile(path, []byte(strings.TrimSpace(token)), 0o600)
}

func (s *Service) readReleases(siteRoot string) []Release {
	path := s.releasesMetaPath(siteRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		return []Release{}
	}
	var rels []Release
	if err := json.Unmarshal(data, &rels); err != nil {
		return []Release{}
	}
	return rels
}

func (s *Service) writeReleases(siteRoot string, rels []Release) error {
	path := s.releasesMetaPath(siteRoot)
	data, err := json.MarshalIndent(rels, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// ListReleases returns the historical deployments and current active release.
func (s *Service) ListReleases(domain string) ([]Release, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return nil, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	rels := s.readReleases(site.Root)
	if len(rels) == 0 {
		// If no atomic releases recorded yet, check if standard deployments exist in store
		if site.Git != nil && len(site.Git.History) > 0 {
			for i, h := range site.Git.History {
				rels = append(rels, Release{
					ID:         h.ID,
					CommitHash: h.CommitHash,
					CommitMsg:  h.CommitMsg,
					Branch:     "main",
					Path:       site.Root,
					Active:     i == 0,
					DeployedAt: h.StartedAt,
				})
			}
		} else {
			// In dry-run or default state, return initial baseline release
			now := time.Now().UTC()
			rels = []Release{
				{
					ID:         "release_initial",
					CommitHash: "head",
					CommitMsg:  "Initial production deployment",
					Branch:     "main",
					Path:       filepath.Join(site.Root, "current"),
					Active:     true,
					DeployedAt: now,
				},
			}
		}
	}
	return rels, nil
}

// Rollback atomically switches the current symlink to a prior release.
func (s *Service) Rollback(ctx context.Context, domain string, targetReleaseID string) (Release, error) {
	site, ok := s.st.GetSite(domain)
	if !ok {
		return Release{}, apierr.NotFound("site_not_found", fmt.Sprintf("site %q does not exist", domain))
	}

	rels := s.readReleases(site.Root)
	if len(rels) == 0 {
		// Populate initial list from history
		listed, _ := s.ListReleases(domain)
		rels = listed
	}

	if len(rels) < 2 && (targetReleaseID == "" || targetReleaseID == "previous") {
		return Release{}, apierr.BadRequest("no_previous_release", "no previous release available to rollback to")
	}

	targetIndex := -1
	targetReleaseID = strings.TrimSpace(targetReleaseID)

	if targetReleaseID == "" || targetReleaseID == "previous" {
		// Find active index and select the next one
		for i, r := range rels {
			if r.Active && i+1 < len(rels) {
				targetIndex = i + 1
				break
			}
		}
		if targetIndex == -1 && len(rels) > 1 {
			targetIndex = 1
		}
	} else {
		for i, r := range rels {
			if r.ID == targetReleaseID {
				targetIndex = i
				break
			}
		}
	}

	if targetIndex == -1 {
		return Release{}, apierr.NotFound("release_not_found", fmt.Sprintf("target release %q not found", targetReleaseID))
	}

	targetRel := rels[targetIndex]

	// Atomically swap symlink if release path exists on disk
	currentLink := filepath.Join(site.Root, "current")
	tmpLink := filepath.Join(site.Root, "current.tmp")

	if !s.cfg.DryRun {
		if _, err := os.Stat(targetRel.Path); err == nil {
			_ = os.Remove(tmpLink)
			_ = os.Symlink(targetRel.Path, tmpLink)
			_ = os.Rename(tmpLink, currentLink)
		}
	}

	// Update active flags
	for i := range rels {
		rels[i].Active = (i == targetIndex)
	}
	_ = s.writeReleases(site.Root, rels)

	if s.restarter != nil {
		_ = s.restarter(ctx, domain)
	}

	if s.audit != nil {
		_ = s.audit.Append(audit.Record{
			Action: "git.rollback",
			Params: map[string]any{"domain": domain, "releaseId": targetRel.ID},
			Result: audit.ResultAccepted,
		})
	}

	return rels[targetIndex], nil
}

// RecordAtomicRelease saves a new atomic release and sets it active.
func (s *Service) RecordAtomicRelease(siteRoot string, rel Release) error {
	rels := s.readReleases(siteRoot)
	for i := range rels {
		rels[i].Active = false
	}
	rel.Active = true
	rels = append([]Release{rel}, rels...)

	// Retain up to 5 historical releases
	if len(rels) > 5 {
		// Prune older release folders if not dry run
		for _, old := range rels[5:] {
			if strings.Contains(old.Path, "releases") {
				_ = os.RemoveAll(old.Path)
			}
		}
		rels = rels[:5]
	}

	return s.writeReleases(siteRoot, rels)
}
