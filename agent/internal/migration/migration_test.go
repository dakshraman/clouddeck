package migration

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/mail"
	"clouddeck/agent/internal/sites"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

func createMockCPMoveTarGz(t *testing.T, archivePath string) {
	t.Helper()
	var buf bytes.Buffer
	gzw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gzw)

	files := map[string]string{
		"cpmove-johndoe/userdata/example.com":                "documentroot: /home/johndoe/public_html\nphpversion: 8.3\n",
		"cpmove-johndoe/homedir/public_html/index.php":       "<?php echo 'migrated cpanel content'; ?>",
		"cpmove-johndoe/mysql/johndoe_blog.sql":              "-- MySQL dump\nCREATE TABLE posts (id INT);",
		"cpmove-johndoe/mail/example.com/hello/cur/1000.msg": "From: test@test.com\nSubject: Migrated\n\nBody",
	}

	for name, content := range files {
		hdr := &tar.Header{
			Name:     name,
			Mode:     0o644,
			Size:     int64(len(content)),
			Typeflag: tar.TypeReg,
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write tar header: %v", err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("write tar content: %v", err)
		}
	}

	tw.Close()
	gzw.Close()

	if err := os.WriteFile(archivePath, buf.Bytes(), 0o644); err != nil {
		t.Fatalf("write mock cpmove archive: %v", err)
	}
}

func TestMigrationLifecycle(t *testing.T) {
	dir := t.TempDir()

	st, err := store.Open(filepath.Join(dir, "store.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}

	auditLog, err := audit.Open(dir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}

	cfg := config.Config{
		StateDir:      dir,
		NginxSitesDir: filepath.Join(dir, "nginx"),
		Webroot:       filepath.Join(dir, "www"),
		MailRoot:      filepath.Join(dir, "mail"),
		LogDir:        filepath.Join(dir, "logs"),
		DryRun:        true,
	}

	eng := tasks.New(st, context.Background())
	t.Cleanup(eng.Wait)

	siteSvc := sites.New(st, eng, auditLog, cfg)
	mailSvc := mail.New(cfg, auditLog, nil)
	migSvc := New(cfg, siteSvc, nil, mailSvc, auditLog, eng)

	// 1. Initial history is empty
	hist, err := migSvc.History()
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(hist) != 0 {
		t.Fatalf("expected 0 history items, got %d", len(hist))
	}

	// 2. Upload archive
	archiveFile := filepath.Join(dir, "cpmove-johndoe.tar.gz")
	createMockCPMoveTarGz(t, archiveFile)

	f, err := os.Open(archiveFile)
	if err != nil {
		t.Fatalf("open archive: %v", err)
	}
	defer f.Close()

	uploadedPath, err := migSvc.UploadArchive(f, "cpmove-johndoe.tar.gz")
	if err != nil {
		t.Fatalf("UploadArchive: %v", err)
	}
	if uploadedPath == "" {
		t.Fatalf("expected valid uploadedPath")
	}

	// 3. Import cPanel archive
	res, err := migSvc.ImportCPanel(context.Background(), uploadedPath, true)
	if err != nil {
		t.Fatalf("ImportCPanel: %v", err)
	}
	if !res.Success {
		t.Fatalf("expected Import success")
	}
	if res.Migration.Username != "johndoe" {
		t.Fatalf("expected username johndoe, got %s", res.Migration.Username)
	}
	if len(res.Migration.Domains) == 0 || res.Migration.Domains[0] != "example.com" {
		t.Fatalf("expected example.com in domains, got %v", res.Migration.Domains)
	}
	if len(res.Migration.Databases) == 0 || res.Migration.Databases[0] != "johndoe_blog" {
		t.Fatalf("expected johndoe_blog in databases, got %v", res.Migration.Databases)
	}
	if len(res.Migration.Mailboxes) == 0 || res.Migration.Mailboxes[0] != "hello@example.com" {
		t.Fatalf("expected hello@example.com in mailboxes, got %v", res.Migration.Mailboxes)
	}

	// 4. History now contains record
	hist2, err := migSvc.History()
	if err != nil {
		t.Fatalf("History after import: %v", err)
	}
	if len(hist2) != 1 {
		t.Fatalf("expected 1 history record, got %d", len(hist2))
	}
	if hist2[0].Status != "completed" {
		t.Fatalf("expected status=completed, got %s", hist2[0].Status)
	}
}
