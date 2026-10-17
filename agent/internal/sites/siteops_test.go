package sites

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
	"clouddeck/agent/internal/tasks"
)

var opIDRe = regexp.MustCompile(`^[0-9a-f]{8}$`)

// harness wires the site service to real temp dirs, a real store, the shared
// task engine and a fake PATH so no nginx/systemctl on the host is ever run.
type harness struct {
	t        *testing.T
	svc      *Service
	st       *store.Store
	eng      *tasks.Engine
	cfg      config.Config
	stateDir string
	binDir   string
}

func newHarness(t *testing.T, mutate func(*config.Config)) *harness {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake nginx/systemctl scripts require a POSIX shell")
	}
	dir := t.TempDir()
	stateDir := filepath.Join(dir, "state")
	st, err := store.Open(stateDir)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	auditLog, err := audit.Open(stateDir)
	if err != nil {
		t.Fatalf("audit.Open: %v", err)
	}
	cfg := config.Config{
		StateDir:      stateDir,
		NginxSitesDir: filepath.Join(dir, "nginx"),
		Webroot:       filepath.Join(dir, "www"),
		PHPBase:       filepath.Join(dir, "php"),
		LogDir:        filepath.Join(dir, "logs"),
		PHPFpmSock:    "/run/php/php{{version}}-fpm.sock",
		CronDir:       filepath.Join(dir, "cron"),
	}
	if mutate != nil {
		mutate(&cfg)
	}
	for _, v := range []string{"8.3", "8.4"} {
		if err := os.MkdirAll(filepath.Join(cfg.PHPBase, v), 0o755); err != nil {
			t.Fatalf("create fake php dir: %v", err)
		}
	}
	if err := os.MkdirAll(cfg.NginxSitesDir, 0o755); err != nil {
		t.Fatalf("create nginx sites dir: %v", err)
	}
	binDir := filepath.Join(dir, "bin")
	writeFakeBin(t, binDir, "nginx", 0)
	writeFakeBin(t, binDir, "systemctl", 0)
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	eng := tasks.New(st, context.Background())
	svc := New(st, eng, auditLog, cfg)
	t.Cleanup(eng.Wait)
	return &harness{t: t, svc: svc, st: st, eng: eng, cfg: cfg, stateDir: stateDir, binDir: binDir}
}

// writeFakeBin drops an executable nginx/systemctl stand-in exiting with code.
func writeFakeBin(t *testing.T, dir, name string, code int) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create bin dir: %v", err)
	}
	script := "#!/bin/sh\nexit 0\n"
	if code != 0 {
		script = fmt.Sprintf("#!/bin/sh\nexit %d\n", code)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake %s: %v", name, err)
	}
}

// addSite registers an active site with a webroot, bypassing nginx.
func (h *harness) addSite(domain, phpVersion string) store.Site {
	h.t.Helper()
	now := store.Now()
	site := store.Site{
		Domain:     domain,
		Root:       filepath.Join(h.cfg.Webroot, domain),
		PHPVersion: phpVersion,
		SSL:        store.SSL{Enabled: false},
		Status:     store.SiteActive,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := os.MkdirAll(site.Root, 0o755); err != nil {
		h.t.Fatalf("create webroot: %v", err)
	}
	if err := h.st.CreateSite(site); err != nil {
		h.t.Fatalf("CreateSite: %v", err)
	}
	return site
}

// renderSite writes the site config through the normal nginx pipeline.
func (h *harness) renderSite(site store.Site) {
	h.t.Helper()
	if err := h.svc.ApplyNginx(context.Background(), func(level, message string) {}, site); err != nil {
		h.t.Fatalf("ApplyNginx(%s): %v", site.Domain, err)
	}
}

func (h *harness) conf(domain string) string {
	h.t.Helper()
	data, err := os.ReadFile(filepath.Join(h.cfg.NginxSitesDir, domain+".conf"))
	if err != nil {
		h.t.Fatalf("read nginx config: %v", err)
	}
	return string(data)
}

func (h *harness) runTask(task store.Task) store.Task {
	h.t.Helper()
	h.eng.Wait()
	got, ok := h.st.GetTask(task.ID)
	if !ok {
		h.t.Fatalf("task %s not found", task.ID)
	}
	return got
}

func (h *harness) auditLog() string {
	h.t.Helper()
	data, err := os.ReadFile(filepath.Join(h.stateDir, "audit.log"))
	if err != nil {
		h.t.Fatalf("read audit log: %v", err)
	}
	return string(data)
}

func assertContains(t *testing.T, haystack string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(haystack, want) {
			t.Errorf("missing %q in:\n%s", want, haystack)
		}
	}
}

func wantAPIError(t *testing.T, err error, status int, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want %d %s", status, code)
	}
	api, ok := apierr.As(err)
	if !ok {
		t.Fatalf("error %v is not an apierr", err)
	}
	if api.Status != status || api.Code != code {
		t.Fatalf("error = %d %s, want %d %s (%v)", api.Status, api.Code, status, code, err)
	}
}

func TestSubdomainCreateAndDelete(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	task, err := h.svc.CreateSubdomain("example.com", "blog")
	if err != nil {
		t.Fatalf("CreateSubdomain: %v", err)
	}
	done := h.runTask(task)
	if done.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s (%v), want succeeded", done.Status, done.Error)
	}
	if done.Type != TaskSubdomainCreate {
		t.Errorf("task type = %q, want %q", done.Type, TaskSubdomainCreate)
	}

	// placeholder webroot
	placeholder := filepath.Join(site.Root, "blog", "index.html")
	data, err := os.ReadFile(placeholder)
	if err != nil {
		t.Fatalf("read placeholder: %v", err)
	}
	if !strings.Contains(string(data), "blog.example.com") {
		t.Errorf("placeholder %q does not mention blog.example.com", data)
	}

	// state
	got, _ := h.st.GetSite("example.com")
	if len(got.Subdomains) != 1 || got.Subdomains[0].Name != "blog" {
		t.Fatalf("subdomains = %+v, want [blog]", got.Subdomains)
	}

	// rendered config
	conf := h.conf("example.com")
	assertContains(t, conf, "server_name blog.example.com;", "root "+filepath.Join(site.Root, "blog")+";")

	// delete
	task, err = h.svc.DeleteSubdomain("example.com", "blog")
	if err != nil {
		t.Fatalf("DeleteSubdomain: %v", err)
	}
	done = h.runTask(task)
	if done.Status != store.TaskSucceeded {
		t.Fatalf("delete task = %s (%v), want succeeded", done.Status, done.Error)
	}
	got, _ = h.st.GetSite("example.com")
	if len(got.Subdomains) != 0 {
		t.Errorf("subdomains after delete = %+v, want none", got.Subdomains)
	}
	if strings.Contains(h.conf("example.com"), "blog.example.com") {
		t.Errorf("config still contains the deleted subdomain:\n%s", h.conf("example.com"))
	}
	if _, err := os.Stat(filepath.Join(site.Root, "blog")); err != nil {
		t.Errorf("subdomain webroot should be kept on disk: %v", err)
	}

	assertContains(t, h.auditLog(),
		`"action":"site.subdomain.create"`, `"action":"site.subdomain.delete"`, `"result":"accepted"`)
}

func TestSubdomainValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com", "none")

	invalid := []string{"", "www", "Blog", "-blog", "blog-", "a..b", strings.Repeat("a", 64), "blog_x", "blog.example.com"}
	for _, name := range invalid {
		_, err := h.svc.CreateSubdomain("example.com", name)
		wantAPIError(t, err, 400, "invalid_subdomain")
	}

	task, err := h.svc.CreateSubdomain("example.com", "shop")
	if err != nil {
		t.Fatalf("CreateSubdomain(shop): %v", err)
	}
	if got := h.runTask(task); got.Status != store.TaskSucceeded {
		t.Fatalf("create task = %s (%v), want succeeded", got.Status, got.Error)
	}
	_, err = h.svc.CreateSubdomain("example.com", "shop")
	wantAPIError(t, err, 409, "subdomain_exists")

	_, err = h.svc.DeleteSubdomain("example.com", "nosuch")
	wantAPIError(t, err, 404, "subdomain_not_found")

	_, err = h.svc.CreateSubdomain("bad_domain", "shop")
	wantAPIError(t, err, 400, "invalid_domain")
	_, err = h.svc.DeleteSubdomain("bad_domain", "shop")
	wantAPIError(t, err, 400, "invalid_domain")
	_, err = h.svc.CreateSubdomain("other.example", "shop")
	wantAPIError(t, err, 404, "site_not_found")

	assertContains(t, h.auditLog(), `"action":"site.subdomain.create"`, `"result":"rejected"`)
}

func TestSubdomainCreateRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	task, err := h.svc.CreateSubdomain("example.com", "blog")
	if err != nil {
		t.Fatalf("CreateSubdomain: %v", err)
	}
	done := h.runTask(task)
	if done.Status != store.TaskFailed {
		t.Fatalf("task = %s, want failed", done.Status)
	}
	got, _ := h.st.GetSite("example.com")
	if len(got.Subdomains) != 0 {
		t.Errorf("subdomains after failed render = %+v, want none", got.Subdomains)
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render")
	}
}

func TestSubdomainDeleteRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	if err := h.st.UpdateSite("example.com", func(cur *store.Site) {
		cur.Subdomains = append(cur.Subdomains, store.Subdomain{Name: "blog", CreatedAt: store.Now()})
	}); err != nil {
		t.Fatalf("seed subdomain: %v", err)
	}
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	task, err := h.svc.DeleteSubdomain("example.com", "blog")
	if err != nil {
		t.Fatalf("DeleteSubdomain: %v", err)
	}
	if got := h.runTask(task); got.Status != store.TaskFailed {
		t.Fatalf("task = %s, want failed", got.Status)
	}
	got, _ := h.st.GetSite("example.com")
	if len(got.Subdomains) != 1 || got.Subdomains[0].Name != "blog" {
		t.Errorf("subdomains after failed render = %+v, want [blog]", got.Subdomains)
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render")
	}
}

func TestRedirectAddRemoveAndRender(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	list, err := h.svc.AddRedirect("example.com", "/old", "https://new.example.net", true)
	if err != nil {
		t.Fatalf("AddRedirect: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("redirects = %+v, want 1 entry", list)
	}
	if !opIDRe.MatchString(list[0].ID) {
		t.Errorf("redirect id = %q, want 8 lowercase hex chars", list[0].ID)
	}
	assertContains(t, h.conf("example.com"), "location /old { return 301 https://new.example.net; }")

	list, err = h.svc.AddRedirect("example.com", "/tmp", "http://plain.example.net", false)
	if err != nil {
		t.Fatalf("AddRedirect: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("redirects = %+v, want 2 entries", list)
	}
	assertContains(t, h.conf("example.com"),
		"location /old { return 301 https://new.example.net; }",
		"location /tmp { return 302 http://plain.example.net; }")

	list, err = h.svc.DeleteRedirect("example.com", list[1].ID)
	if err != nil {
		t.Fatalf("DeleteRedirect: %v", err)
	}
	if len(list) != 1 || list[0].From != "/old" {
		t.Fatalf("redirects after delete = %+v, want [/old]", list)
	}
	if strings.Contains(h.conf("example.com"), "location /tmp {") {
		t.Errorf("config still contains the deleted redirect:\n%s", h.conf("example.com"))
	}

	_, err = h.svc.DeleteRedirect("example.com", "deadbeef")
	wantAPIError(t, err, 404, "redirect_not_found")

	assertContains(t, h.auditLog(), `"action":"site.redirect.add"`, `"action":"site.redirect.delete"`, `"result":"accepted"`)
}

func TestRedirectValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com", "none")

	invalid := []struct{ from, to string }{
		{"old", "https://x.example.net"},
		{"/old", "ftp://x.example.net"},
		{"/old", "not-a-url"},
		{"/old", "https://"},
		{"/bad path", "https://x.example.net"},
		{"/bad\tpath", "https://x.example.net"},
		{`/bad"path`, "https://x.example.net"},
		{"/bad'path", "https://x.example.net"},
		{"/bad;path", "https://x.example.net"},
		{"/bad{path}", "https://x.example.net"},
		{"/", strings.Repeat("a", 2049)},
		{strings.Repeat("/a", 257), "https://x.example.net"},
	}
	for _, tc := range invalid {
		_, err := h.svc.AddRedirect("example.com", tc.from, tc.to, true)
		wantAPIError(t, err, 400, "invalid_redirect")
	}
	if got := h.auditLog(); !strings.Contains(got, `"action":"site.redirect.add"`) {
		t.Errorf("rejected redirects were not audited:\n%s", got)
	}

	// Valid boundary cases.
	if _, err := h.svc.AddRedirect("example.com", "/ok", "https://x.example.net/"+strings.Repeat("a", 2000), false); err != nil {
		t.Fatalf("AddRedirect at the size limit: %v", err)
	}
}

func TestRedirectRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	_, err := h.svc.AddRedirect("example.com", "/old", "https://new.example.net", true)
	wantAPIError(t, err, 500, "internal")

	got, _ := h.st.GetSite("example.com")
	if len(got.Redirects) != 0 {
		t.Errorf("redirects after failed render = %+v, want none", got.Redirects)
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render:\n%s", h.conf("example.com"))
	}
}

func TestCronAddRemoveFragment(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	jobs, err := h.svc.AddCron("example.com", "0 3 * * *", "/usr/bin/php /www/cli.php", "nightly", "")
	if err != nil {
		t.Fatalf("AddCron: %v", err)
	}
	if len(jobs) != 1 || !opIDRe.MatchString(jobs[0].ID) {
		t.Fatalf("cron = %+v, want one job with an 8 hex id", jobs)
	}

	fragment := filepath.Join(h.cfg.CronDir, "clouddeck-example-com")
	want := "# managed-by: clouddeck (site example.com)\n0 3 * * * root /usr/bin/php /www/cli.php\n"
	data, err := os.ReadFile(fragment)
	if err != nil {
		t.Fatalf("read cron fragment: %v", err)
	}
	if string(data) != want {
		t.Errorf("fragment = %q, want %q", data, want)
	}
	if info, err := os.Stat(fragment); err != nil {
		t.Fatalf("stat cron fragment: %v", err)
	} else if perm := info.Mode().Perm(); perm != 0o644 {
		t.Errorf("fragment mode = %o, want 644", perm)
	}

	jobs, err = h.svc.AddCron("example.com", "*/5 * * * *", "/usr/bin/php /www/other.php", "", "")
	if err != nil {
		t.Fatalf("AddCron: %v", err)
	}
	if len(jobs) != 2 {
		t.Fatalf("cron = %+v, want 2 jobs", jobs)
	}
	want = "# managed-by: clouddeck (site example.com)\n" +
		"0 3 * * * root /usr/bin/php /www/cli.php\n" +
		"*/5 * * * * root /usr/bin/php /www/other.php\n"
	data, _ = os.ReadFile(fragment)
	if string(data) != want {
		t.Errorf("fragment = %q, want %q", data, want)
	}

	jobs, err = h.svc.DeleteCron("example.com", jobs[0].ID)
	if err != nil {
		t.Fatalf("DeleteCron: %v", err)
	}
	if len(jobs) != 1 || jobs[0].Schedule != "*/5 * * * *" {
		t.Fatalf("cron after delete = %+v, want the */5 job", jobs)
	}
	want = "# managed-by: clouddeck (site example.com)\n*/5 * * * * root /usr/bin/php /www/other.php\n"
	data, _ = os.ReadFile(fragment)
	if string(data) != want {
		t.Errorf("fragment after delete = %q, want %q", data, want)
	}

	if _, err := h.svc.DeleteCron("example.com", jobs[0].ID); err != nil {
		t.Fatalf("DeleteCron(last): %v", err)
	}
	data, _ = os.ReadFile(fragment)
	if want := "# managed-by: clouddeck (site example.com)\n"; string(data) != want {
		t.Errorf("fragment after last delete = %q, want %q", data, want)
	}

	_, err = h.svc.DeleteCron("example.com", "deadbeef")
	wantAPIError(t, err, 404, "cron_not_found")

	assertContains(t, h.auditLog(), `"action":"site.cron.add"`, `"action":"site.cron.delete"`, `"result":"accepted"`)
}

func TestCronValidation(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com", "none")

	invalid := []struct{ schedule, command, comment string }{
		{"", "/bin/true", ""},
		{"0 3 * *", "/bin/true", ""},
		{"0 3 * * * *", "/bin/true", ""},
		{"a 3 * * *", "/bin/true", ""},
		{"0 3 * * " + strings.Repeat("1", 21), "/bin/true", ""},
		{"0 3 * * *", "", ""},
		{"0 3 * * *", strings.Repeat("x", 1025), ""},
		{"0 3 * * *", "line1\nline2", ""},
		{"0 3 * * *", "/bin/true", strings.Repeat("c", 201)},
		{"0 3 * * *", "/bin/true", "line1\nline2"},
	}
	for _, tc := range invalid {
		_, err := h.svc.AddCron("example.com", tc.schedule, tc.command, tc.comment, "")
		wantAPIError(t, err, 400, "invalid_cron")
	}
	// Nothing was persisted or written.
	got, _ := h.st.GetSite("example.com")
	if len(got.Cron) != 0 {
		t.Errorf("cron after rejected adds = %+v, want none", got.Cron)
	}
	if _, err := os.Stat(filepath.Join(h.cfg.CronDir, "clouddeck-example-com")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("fragment written for rejected jobs: %v", err)
	}
}

func TestCronFragmentWriteFailureRollsBack(t *testing.T) {
	h := newHarness(t, nil)
	h.addSite("example.com", "none")
	// A file where the cron dir should be makes MkdirAll/write fail.
	if err := os.WriteFile(h.cfg.CronDir, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write blocker: %v", err)
	}
	_, err := h.svc.AddCron("example.com", "0 3 * * *", "/bin/true", "", "")
	wantAPIError(t, err, 500, "internal")
	got, _ := h.st.GetSite("example.com")
	if len(got.Cron) != 0 {
		t.Errorf("cron after failed fragment write = %+v, want none", got.Cron)
	}
}

func TestSetPHPVersion(t *testing.T) {
	h := newHarness(t, func(cfg *config.Config) {
		cfg.PHPSockMap = "8.4=/tmp/php-cgi-84.sock"
	})
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	// Version absent from the map falls back to the socket template.
	got, err := h.svc.SetPHPVersion("example.com", "8.3")
	if err != nil {
		t.Fatalf("SetPHPVersion(8.3): %v", err)
	}
	if got.PHPVersion != "8.3" {
		t.Fatalf("phpVersion = %q, want 8.3", got.PHPVersion)
	}
	assertContains(t, h.conf("example.com"), "fastcgi_pass unix:/run/php/php8.3-fpm.sock;")

	// Version present in the map wins.
	if _, err := h.svc.SetPHPVersion("example.com", "8.4"); err != nil {
		t.Fatalf("SetPHPVersion(8.4): %v", err)
	}
	assertContains(t, h.conf("example.com"), "fastcgi_pass unix:/tmp/php-cgi-84.sock;")

	// Unoffered version is refused and leaves the site alone.
	_, err = h.svc.SetPHPVersion("example.com", "9.9")
	wantAPIError(t, err, 400, "invalid_php_version")
	if site, _ := h.st.GetSite("example.com"); site.PHPVersion != "8.4" {
		t.Errorf("phpVersion after rejected switch = %q, want 8.4", site.PHPVersion)
	}

	// "none" turns the site static again.
	if _, err := h.svc.SetPHPVersion("example.com", "none"); err != nil {
		t.Fatalf("SetPHPVersion(none): %v", err)
	}
	if strings.Contains(h.conf("example.com"), "fastcgi_pass") {
		t.Errorf("static site config still contains a PHP block:\n%s", h.conf("example.com"))
	}

	assertContains(t, h.auditLog(), `"action":"site.php.set"`, `"result":"accepted"`, `"result":"rejected"`)
}

func TestSetPHPVersionRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	_, err := h.svc.SetPHPVersion("example.com", "8.3")
	wantAPIError(t, err, 500, "internal")
	if got, _ := h.st.GetSite("example.com"); got.PHPVersion != "none" {
		t.Errorf("phpVersion after failed render = %q, want none", got.PHPVersion)
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render")
	}
}

func TestBlockAndUnblockIP(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)

	list, err := h.svc.BlockIP("example.com", "203.0.113.7", "spam")
	if err != nil {
		t.Fatalf("BlockIP: %v", err)
	}
	if len(list) != 1 || list[0].IP != "203.0.113.7" || list[0].Note != "spam" {
		t.Fatalf("blocked = %+v, want [203.0.113.7 spam]", list)
	}
	assertContains(t, h.conf("example.com"), "deny 203.0.113.7;")

	// IPv6 input is stored in its normalized parsed form.
	list, err = h.svc.BlockIP("example.com", "2001:DB8::1", "")
	if err != nil {
		t.Fatalf("BlockIP(v6): %v", err)
	}
	if list[1].IP != "2001:db8::1" {
		t.Errorf("stored ip = %q, want 2001:db8::1", list[1].IP)
	}
	assertContains(t, h.conf("example.com"), "deny 2001:db8::1;")

	// A duplicate in a different spelling is still a duplicate.
	_, err = h.svc.BlockIP("example.com", "203.0.113.7", "")
	wantAPIError(t, err, 409, "ip_exists")

	_, err = h.svc.BlockIP("example.com", "definitely-not-an-ip", "")
	wantAPIError(t, err, 400, "invalid_ip")
	_, err = h.svc.UnblockIP("example.com", "definitely-not-an-ip")
	wantAPIError(t, err, 400, "invalid_ip")

	list, err = h.svc.UnblockIP("example.com", "203.0.113.7")
	if err != nil {
		t.Fatalf("UnblockIP: %v", err)
	}
	if len(list) != 1 || list[0].IP != "2001:db8::1" {
		t.Fatalf("blocked after unblock = %+v, want [2001:db8::1]", list)
	}
	if strings.Contains(h.conf("example.com"), "deny 203.0.113.7;") {
		t.Errorf("config still denies the unblocked IP:\n%s", h.conf("example.com"))
	}

	_, err = h.svc.UnblockIP("example.com", "198.51.100.9")
	wantAPIError(t, err, 404, "ip_not_found")

	assertContains(t, h.auditLog(), `"action":"site.ip.block"`, `"action":"site.ip.unblock"`, `"result":"accepted"`)
}

func TestBlockIPRollbackWhenNginxFails(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	before := h.conf("example.com")

	writeFakeBin(t, h.binDir, "nginx", 1)
	_, err := h.svc.BlockIP("example.com", "203.0.113.7", "")
	wantAPIError(t, err, 500, "internal")
	if got, _ := h.st.GetSite("example.com"); len(got.BlockedIPs) != 0 {
		t.Errorf("blocked IPs after failed render = %+v, want none", got.BlockedIPs)
	}
	if h.conf("example.com") != before {
		t.Errorf("nginx config not restored after failed render")
	}
}

func TestSiteOperationsDryRun(t *testing.T) {
	h := newHarness(t, func(cfg *config.Config) { cfg.DryRun = true })
	h.addSite("example.com", "none")

	_, err := h.svc.CreateSubdomain("example.com", "blog")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.DeleteSubdomain("example.com", "blog")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.AddRedirect("example.com", "/old", "https://new.example.net", true)
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.DeleteRedirect("example.com", "deadbeef")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.AddCron("example.com", "0 3 * * *", "/bin/true", "", "")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.DeleteCron("example.com", "deadbeef")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.SetPHPVersion("example.com", "8.3")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.BlockIP("example.com", "203.0.113.7", "")
	wantAPIError(t, err, 409, "dry_run")
	_, err = h.svc.UnblockIP("example.com", "203.0.113.7")
	wantAPIError(t, err, 409, "dry_run")

	// Reads keep working.
	if list, err := h.svc.ListSubdomains("example.com"); err != nil || len(list) != 0 {
		t.Errorf("ListSubdomains in dry-run = %+v, %v", list, err)
	}
	if list, err := h.svc.ListRedirects("example.com"); err != nil || len(list) != 0 {
		t.Errorf("ListRedirects in dry-run = %+v, %v", list, err)
	}
	if list, err := h.svc.ListCron("example.com"); err != nil || len(list) != 0 {
		t.Errorf("ListCron in dry-run = %+v, %v", list, err)
	}
	if list, err := h.svc.ListBlockedIPs("example.com"); err != nil || len(list) != 0 {
		t.Errorf("ListBlockedIPs in dry-run = %+v, %v", list, err)
	}
}

func TestListOperationsUnknownSite(t *testing.T) {
	h := newHarness(t, nil)
	for name, err := range map[string]error{
		"subdomains": func() error { _, err := h.svc.ListSubdomains("nope.example"); return err }(),
		"redirects":  func() error { _, err := h.svc.ListRedirects("nope.example"); return err }(),
		"cron":       func() error { _, err := h.svc.ListCron("nope.example"); return err }(),
		"security":   func() error { _, err := h.svc.ListBlockedIPs("nope.example"); return err }(),
	} {
		if err == nil {
			t.Errorf("List%s(unknown) = nil, want 404", name)
			continue
		}
		wantAPIError(t, err, 404, "site_not_found")
	}
}

func TestDeprovisionRemovesCronFragment(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("example.com", "none")
	h.renderSite(site)
	if _, err := h.svc.AddCron("example.com", "0 3 * * *", "/bin/true", "", ""); err != nil {
		t.Fatalf("AddCron: %v", err)
	}
	fragment := filepath.Join(h.cfg.CronDir, "clouddeck-example-com")
	if _, err := os.Stat(fragment); err != nil {
		t.Fatalf("fragment missing before delete: %v", err)
	}

	task, err := h.svc.Delete("example.com")
	if err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got := h.runTask(task); got.Status != store.TaskSucceeded {
		t.Fatalf("delete task = %s (%v), want succeeded", got.Status, got.Error)
	}
	if _, err := os.Stat(fragment); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("cron fragment still present after site delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(h.cfg.NginxSitesDir, "example.com.conf")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("nginx config still present after site delete: %v", err)
	}
	if _, ok := h.st.GetSite("example.com"); ok {
		t.Errorf("site still in state after delete")
	}
}
