package phpmyadmin

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"clouddeck/agent/internal/config"
)

// releaseArchive builds the minimal tarball layout the installer expects.
func releaseArchive(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	body := []byte("<?php\necho 'phpMyAdmin';\n")
	if err := tw.WriteHeader(&tar.Header{
		Name: "phpMyAdmin-9.9.9-all-languages/index.php",
		Mode: 0o644,
		Size: int64(len(body)),
	}); err != nil {
		t.Fatalf("tar header: %v", err)
	}
	if _, err := tw.Write(body); err != nil {
		t.Fatalf("tar body: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return buf.Bytes()
}

// releaseServer serves the version feed, tarball and checksum sidecar.
func releaseServer(t *testing.T, archive []byte) *httptest.Server {
	t.Helper()
	sum := sha256.Sum256(archive)
	sumHex := hex.EncodeToString(sum[:])
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/version.json":
			_, _ = w.Write([]byte(`{"version":"9.9.9"}`))
		case "/9.9.9/phpMyAdmin-9.9.9-all-languages.tar.gz.sha256":
			_, _ = w.Write([]byte(sumHex + "  phpMyAdmin-9.9.9-all-languages.tar.gz\n"))
		case "/9.9.9/phpMyAdmin-9.9.9-all-languages.tar.gz":
			_, _ = w.Write(archive)
		default:
			http.NotFound(w, r)
		}
	}))
}

func TestLatestVersionAndDownload(t *testing.T) {
	archive := releaseArchive(t)
	srv := releaseServer(t, archive)
	defer srv.Close()

	svc := &Service{cfg: config.Config{
		PHPMYADMINVersionURL: srv.URL + "/version.json",
		PHPMYADMINDistBase:   srv.URL,
	}}
	version, err := svc.latestVersion(context.Background())
	if err != nil || version != "9.9.9" {
		t.Fatalf("latestVersion = %q, %v; want 9.9.9", version, err)
	}
	path, sum, err := svc.download(context.Background(), version)
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	defer os.Remove(path)
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read archive: %v", err)
	}
	if !bytes.Equal(got, archive) {
		t.Fatal("downloaded archive does not match the served tarball")
	}
	want := sha256.Sum256(archive)
	if sum != hex.EncodeToString(want[:]) {
		t.Fatalf("checksum = %q, want %x", sum, want)
	}
}

func TestDownloadRejectsBadChecksum(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".sha256") {
			_, _ = w.Write([]byte(strings.Repeat("0", 64) + "  phpMyAdmin-9.9.9-all-languages.tar.gz\n"))
			return
		}
		_, _ = w.Write(releaseArchive(t))
	}))
	defer srv.Close()

	svc := &Service{cfg: config.Config{PHPMYADMINDistBase: srv.URL}}
	if _, _, err := svc.download(context.Background(), "9.9.9"); err == nil {
		t.Fatal("download accepted a mismatched checksum")
	}
}

func TestDownloadRequiresChecksumSidecar(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()

	svc := &Service{cfg: config.Config{PHPMYADMINDistBase: srv.URL}}
	if _, _, err := svc.download(context.Background(), "9.9.9"); err == nil {
		t.Fatal("download proceeded without a checksum sidecar")
	}
}

func TestConfigPHPEscapesValues(t *testing.T) {
	svc := &Service{cfg: config.Config{
		MySQLHost:          "db.local",
		MySQLPort:          "3307",
		PHPMYADMINStateDir: "/var/lib/clouddeck/phpmyadmin",
	}}
	conf := svc.configPHP(`a'b\c`)
	for _, want := range []string{
		`$cfg['Servers'][$i]['auth_type'] = 'cookie';`,
		`$cfg['Servers'][$i]['host'] = 'db.local';`,
		`$cfg['Servers'][$i]['port'] = '3307';`,
		`$cfg['Servers'][$i]['AllowNoPassword'] = false;`,
		`$cfg['TempDir'] = '/var/lib/clouddeck/phpmyadmin/tmp';`,
		`'a\'b\\c'`,
		`$cfg['Servers'][$i]['hide_db'] = '^(information_schema|performance_schema|mysql|sys)$';`,
		`$targetDb = '';`,
		`$_COOKIE['pma_single_db']`,
		`$_GET['pma_single_db']`,
		`$_GET['db']`,
		`$systemDbs = ['information_schema', 'performance_schema', 'mysql', 'sys'];`,
		`$cfg['Servers'][$i]['only_db'] = [$targetDb];`,
	} {
		if !strings.Contains(conf, want) {
			t.Errorf("config.inc.php is missing %q\n%s", want, conf)
		}
	}
}

func TestRenderUnitUsesNonRootAndPort(t *testing.T) {
	svc := &Service{cfg: config.Config{
		PHPMYADMINRunAs:    "www-data",
		PHPMYADMINPHPBin:   "/usr/bin/php",
		PHPMYADMINDir:      "/www/server/phpmyadmin",
		PHPMYADMINStateDir: "/var/lib/clouddeck/phpmyadmin",
	}}
	unit := svc.renderUnit("/www/server/phpmyadmin/phpmyadmin_abc123", 18888)
	for _, want := range []string{
		"User=www-data",
		"-S 0.0.0.0:18888",
		"-t /www/server/phpmyadmin",
		"session.save_path=/var/lib/clouddeck/phpmyadmin/sessions",
	} {
		if !strings.Contains(unit, want) {
			t.Errorf("unit is missing %q\n%s", want, unit)
		}
	}
}

func TestSingleTopDir(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "phpMyAdmin-9.9.9-all-languages"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := singleTopDir(dir); err != nil {
		t.Fatalf("singleTopDir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "extra"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := singleTopDir(dir); err == nil {
		t.Fatal("singleTopDir accepted an archive with more than one entry")
	}
}

func TestLoginCredentialsPreferInstalledUser(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "db.json")
	if err := os.WriteFile(path, []byte(`{"user":"clouddeck_pma","password":"generated"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := &Service{cfg: config.Config{
		PHPMYADMINStateDir: dir,
		MySQLRootUser:      "root",
		MySQLRootPass:      "rootpw",
	}}
	if user, password := svc.loginCredentials(); user != "clouddeck_pma" || password != "generated" {
		t.Fatalf("loginCredentials = %q/%q; want the installed user", user, password)
	}
}

func TestLoginCredentialsFallBackToRoot(t *testing.T) {
	svc := &Service{cfg: config.Config{
		PHPMYADMINStateDir: t.TempDir(),
		MySQLRootUser:      "root",
		MySQLRootPass:      "rootpw",
	}}
	if user, password := svc.loginCredentials(); user != "root" || password != "rootpw" {
		t.Fatalf("loginCredentials = %q/%q; want root/rootpw", user, password)
	}
}

func TestChoosePortHonorsConfig(t *testing.T) {
	svc := &Service{cfg: config.Config{PHPMYADMINPort: 18888}}
	port, err := svc.choosePort()
	if err != nil || port != 18888 {
		t.Fatalf("choosePort = %d, %v; want 18888", port, err)
	}
	svc = &Service{}
	port, err = svc.choosePort()
	if err != nil || port <= 0 || port > 65535 {
		t.Fatalf("auto choosePort = %d, %v; want a valid port", port, err)
	}
}

func TestReadyPageRequiresLoginForm(t *testing.T) {
	login := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<form method="post"><input type="hidden" name="token" value="abc"></form>`))
	}))
	defer login.Close()
	port := serverPort(t, login)
	if !readyPage(port, "/") {
		t.Fatal("readyPage rejected a real login form")
	}

	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("phpMyAdmin - Error\nsession_start(): open(SESSION_FILE, O_RDWR) failed: Permission denied (13)"))
	}))
	defer broken.Close()
	if readyPage(serverPort(t, broken), "/") {
		t.Fatal("readyPage accepted a 200 error page")
	}

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/pma/" {
			http.Redirect(w, r, "/pma/index.php", http.StatusFound)
			return
		}
		_, _ = w.Write([]byte(`<form method="post"><input type='hidden' name='token' value='xyz'></form>`))
	}))
	defer redirect.Close()
	if !readyPage(serverPort(t, redirect), "/pma/") {
		t.Fatal("readyPage failed to follow redirect to login form")
	}
}

func TestSingleTopDirIgnoresHidden(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, ".hidden"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "phpMyAdmin-9.9.9-all-languages"), 0o755); err != nil {
		t.Fatal(err)
	}
	top, err := singleTopDir(dir)
	if err != nil {
		t.Fatalf("singleTopDir error = %v; want success with ignored hidden dir", err)
	}
	if filepath.Base(top) != "phpMyAdmin-9.9.9-all-languages" {
		t.Fatalf("top dir = %q; want phpMyAdmin-9.9.9-all-languages", top)
	}
}

func TestRandomPasswordMeetsComplexity(t *testing.T) {
	pass, err := randomPassword(24)
	if err != nil {
		t.Fatalf("randomPassword: %v", err)
	}
	if len(pass) != 24 {
		t.Fatalf("password length = %d, want 24", len(pass))
	}
	hasUpper, hasLower, hasDigit := false, false, false
	for _, ch := range pass {
		switch {
		case ch >= 'A' && ch <= 'Z':
			hasUpper = true
		case ch >= 'a' && ch <= 'z':
			hasLower = true
		case ch >= '0' && ch <= '9':
			hasDigit = true
		}
	}
	if !hasUpper && !hasLower && !hasDigit {
		t.Fatalf("password %q has no valid alphanumeric chars", pass)
	}
}

func TestPHPBinaryPath(t *testing.T) {
	svc := &Service{cfg: config.Config{PHPMYADMINPHPBin: "/usr/bin/custom-php"}}
	if got := svc.phpBinaryPath(); got != "/usr/bin/custom-php" {
		t.Fatalf("phpBinaryPath = %q, want /usr/bin/custom-php", got)
	}
}

func TestInstallRejectsDryRun(t *testing.T) {
	svc := &Service{cfg: config.Config{DryRun: true}}
	err := svc.Install(context.Background(), func(string, string) {}, nil)
	if err == nil || !strings.Contains(err.Error(), "dry-run") {
		t.Fatalf("Install in dry-run = %v; want a dry-run error", err)
	}
}

// TestStatusReadsInstalledVersion keeps the installer's version.pl contract
// pinned to the detector.
func TestStatusReadsInstalledVersion(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "port.pl"), strconv.Itoa(1)+"\n")
	writeTestFile(t, filepath.Join(dir, "version.pl"), "9.9.9\n")
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_"+strings.Repeat("a", 12), "index.php"), "<?php\n")
	st := New(config.Config{PHPMYADMINDir: dir}).Status()
	if !st.Installed || st.Version != "9.9.9" {
		t.Fatalf("Status = %+v; want installed 9.9.9", st)
	}
}
