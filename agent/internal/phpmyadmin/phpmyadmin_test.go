package phpmyadmin

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"clouddeck/agent/internal/config"
)

// writeTestFile writes content to path, creating parent directories.
func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// installDir builds a minimal valid aaPanel-style install rooted at a fresh
// temp dir: port.pl, version.pl and one phpmyadmin_* web directory.
func installDir(t *testing.T, port int) string {
	t.Helper()
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "port.pl"), strconv.Itoa(port)+"\n")
	writeTestFile(t, filepath.Join(dir, "version.pl"), "5.2.1\n")
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "index.php"), "<?php\n")
	return dir
}

// serverPort returns the port of a test HTTP server.
func serverPort(t *testing.T, srv *httptest.Server) int {
	t.Helper()
	tcpAddr, ok := srv.Listener.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener address %T is not TCP", srv.Listener.Addr())
	}
	return tcpAddr.Port
}

func TestStatusDetectsInstall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/phpmyadmin_abc123/" {
			t.Errorf("probe path = %q, want /phpmyadmin_abc123/", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	port := serverPort(t, srv)

	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "port.pl"), fmt.Sprintf("%d\n", port))
	writeTestFile(t, filepath.Join(dir, "version.pl"), "5.2.1\n")
	// No index.php, but sorts first: it must be skipped.
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_aaa", "readme.txt"), "not the web dir\n")
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "index.php"), "<?php\n")
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n$cfg['Servers'][$i]['host'] = 'localhost';\n")
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_zzz", "index.php"), "<?php\n")

	st := New(config.Config{PHPMYADMINDir: dir}).Status()
	if !st.Installed {
		t.Fatalf("Installed = false, want true (status %+v)", st)
	}
	if st.Dir != dir {
		t.Errorf("Dir = %q, want %q", st.Dir, dir)
	}
	if st.Port != port {
		t.Errorf("Port = %d, want %d", st.Port, port)
	}
	if st.Version != "5.2.1" {
		t.Errorf("Version = %q, want %q", st.Version, "5.2.1")
	}
	if st.URLPath != "/phpmyadmin_abc123/" {
		t.Errorf("URLPath = %q, want %q", st.URLPath, "/phpmyadmin_abc123/")
	}
	if st.AuthType != "cookie" {
		t.Errorf("AuthType = %q, want %q", st.AuthType, "cookie")
	}
	if !st.Reachable {
		t.Error("Reachable = false, want true")
	}
}

func TestStatusAuthTypeBestEffort(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv)) // no config.inc.php
	st := New(config.Config{PHPMYADMINDir: dir}).Status()
	if !st.Installed {
		t.Fatalf("Installed = false, want true (status %+v)", st)
	}
	if st.AuthType != "" {
		t.Errorf("AuthType = %q, want empty when config.inc.php is missing", st.AuthType)
	}
}

func TestStatusReachabilityByStatusCode(t *testing.T) {
	tests := []struct {
		name string
		code int
		want bool
	}{
		{name: "ok", code: http.StatusOK, want: true},
		{name: "redirect", code: http.StatusFound, want: true},
		{name: "not found", code: http.StatusNotFound, want: false},
		{name: "server error", code: http.StatusInternalServerError, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.code)
			}))
			defer srv.Close()

			dir := installDir(t, serverPort(t, srv))
			st := New(config.Config{PHPMYADMINDir: dir}).Status()
			if !st.Installed {
				t.Fatalf("Installed = false, want true (status %+v)", st)
			}
			if st.Reachable != tt.want {
				t.Fatalf("Reachable = %v, want %v (status %+v)", st.Reachable, tt.want, st)
			}
		})
	}
}

func TestStatusUnreachableWhenNothingListens(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	port := serverPort(t, srv)
	srv.Close() // free the port so the probe is refused

	dir := installDir(t, port)
	st := New(config.Config{PHPMYADMINDir: dir}).Status()
	if !st.Installed {
		t.Fatalf("Installed = false, want true (status %+v)", st)
	}
	if st.Reachable {
		t.Fatalf("Reachable = true, want false (status %+v)", st)
	}
}

func TestStatusNotInstalled(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T) string
	}{
		{
			name:  "missing dir",
			setup: func(t *testing.T) string { return filepath.Join(t.TempDir(), "absent") },
		},
		{
			name:  "empty dir",
			setup: func(t *testing.T) string { return t.TempDir() },
		},
		{
			name: "port not a number",
			setup: func(t *testing.T) string {
				dir := t.TempDir()
				writeTestFile(t, filepath.Join(dir, "port.pl"), "not-a-port\n")
				return dir
			},
		},
		{
			name: "port zero",
			setup: func(t *testing.T) string {
				dir := t.TempDir()
				writeTestFile(t, filepath.Join(dir, "port.pl"), "0\n")
				return dir
			},
		},
		{
			name: "port negative",
			setup: func(t *testing.T) string {
				dir := t.TempDir()
				writeTestFile(t, filepath.Join(dir, "port.pl"), "-1\n")
				return dir
			},
		},
		{
			name: "no web dir",
			setup: func(t *testing.T) string {
				dir := t.TempDir()
				writeTestFile(t, filepath.Join(dir, "port.pl"), "8080\n")
				return dir
			},
		},
		{
			name: "web dir without index.php",
			setup: func(t *testing.T) string {
				dir := t.TempDir()
				writeTestFile(t, filepath.Join(dir, "port.pl"), "8080\n")
				writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"), "<?php\n")
				return dir
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := tt.setup(t)
			st := New(config.Config{PHPMYADMINDir: dir}).Status()
			if st != (Status{}) {
				t.Fatalf("Status = %+v, want zero status", st)
			}
		})
	}
}
