package git

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

func TestReleasesAndRollback(t *testing.T) {
	tmpDir := t.TempDir()
	st, err := store.Open(filepath.Join(tmpDir, "store.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	siteRoot := filepath.Join(tmpDir, "mysite")
	if err := os.MkdirAll(siteRoot, 0o755); err != nil {
		t.Fatalf("mkdir siteRoot: %v", err)
	}

	domain := "example.com"
	err = st.CreateSite(store.Site{
		Domain:     domain,
		Root:       siteRoot,
		PHPVersion: "8.2",
	})
	if err != nil {
		t.Fatalf("create site: %v", err)
	}

	svc := New(st, config.Config{StateDir: tmpDir, DryRun: true}, nil)

	// Baseline releases
	rels, err := svc.ListReleases(domain)
	if err != nil {
		t.Fatalf("ListReleases error: %v", err)
	}
	if len(rels) != 1 {
		t.Fatalf("expected 1 baseline release, got %d", len(rels))
	}
	if !rels[0].Active {
		t.Errorf("expected baseline release to be active")
	}

	// Add release 1
	rel1Dir := filepath.Join(siteRoot, "releases", "rel1")
	_ = os.MkdirAll(rel1Dir, 0o755)
	err = svc.RecordAtomicRelease(siteRoot, Release{
		ID:         "rel1",
		CommitHash: "hash1",
		CommitMsg:  "Commit 1",
		Branch:     "main",
		Path:       rel1Dir,
		Active:     true,
		DeployedAt: time.Now().Add(-10 * time.Minute),
	})
	if err != nil {
		t.Fatalf("RecordAtomicRelease 1 failed: %v", err)
	}

	// Add release 2
	rel2Dir := filepath.Join(siteRoot, "releases", "rel2")
	_ = os.MkdirAll(rel2Dir, 0o755)
	err = svc.RecordAtomicRelease(siteRoot, Release{
		ID:         "rel2",
		CommitHash: "hash2",
		CommitMsg:  "Commit 2",
		Branch:     "main",
		Path:       rel2Dir,
		Active:     true,
		DeployedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("RecordAtomicRelease 2 failed: %v", err)
	}

	rels, err = svc.ListReleases(domain)
	if err != nil {
		t.Fatalf("ListReleases error: %v", err)
	}
	if len(rels) != 2 {
		t.Fatalf("expected 2 releases, got %d", len(rels))
	}
	if rels[0].ID != "rel2" || !rels[0].Active {
		t.Errorf("expected rel2 to be top and active")
	}

	// Rollback to previous
	rolled, err := svc.Rollback(context.Background(), domain, "")
	if err != nil {
		t.Fatalf("Rollback failed: %v", err)
	}
	if rolled.ID != "rel1" {
		t.Errorf("expected rolled back release to be rel1, got %s", rolled.ID)
	}
	if !rolled.Active {
		t.Errorf("expected rolled back release to be marked active")
	}

	// Verify persistence in list
	rels, err = svc.ListReleases(domain)
	if err != nil {
		t.Fatalf("ListReleases error: %v", err)
	}
	for _, r := range rels {
		if r.ID == "rel1" && !r.Active {
			t.Errorf("rel1 should be active in store")
		}
		if r.ID == "rel2" && r.Active {
			t.Errorf("rel2 should NOT be active in store")
		}
	}
}
