package sites

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func ensureMockWPTarball(t *testing.T) {
	t.Helper()
	tarballPath := "/tmp/clouddeck_wordpress_latest.tar.gz"
	if fi, err := os.Stat(tarballPath); err == nil && fi.Size() > 0 {
		return
	}
	f, err := os.Create(tarballPath)
	if err != nil {
		t.Fatalf("create mock wp tarball: %v", err)
	}
	defer f.Close()
	gw := gzip.NewWriter(f)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	entries := map[string]string{
		"wordpress/index.php":            "<?php // WP Index",
		"wordpress/wp-settings.php":      "<?php // WP Settings",
		"wordpress/wp-content/index.php": "<?php // Content",
	}
	for name, body := range entries {
		hdr := &tar.Header{
			Name: name,
			Mode: 0o644,
			Size: int64(len(body)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write tar header %s: %v", name, err)
		}
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatalf("write tar body %s: %v", name, err)
		}
	}
}

func TestInstallWordPressTemplate(t *testing.T) {
	ensureMockWPTarball(t)
	h := newHarness(t, nil)
	site := h.addSite("wp.example.com", "8.3")

	// Create a placeholder index.html that should be removed
	placeholder := filepath.Join(site.Root, "index.html")
	if err := os.WriteFile(placeholder, []byte("<h1>Placeholder</h1>"), 0o644); err != nil {
		t.Fatalf("write placeholder: %v", err)
	}

	opts := TemplateInstallOptions{
		Template: "wordpress",
		DBName:   "wp_blog",
		DBUser:   "wp_user",
		DBPass:   "wp_secret_pass",
		DBHost:   "127.0.0.1:3306",
	}

	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(wordpress): %v", err)
	}

	// Verify placeholder is removed
	if _, err := os.Stat(placeholder); !os.IsNotExist(err) {
		t.Errorf("placeholder index.html still exists after install")
	}

	// Verify wp-config.php
	cfgPath := filepath.Join(site.Root, "wp-config.php")
	cfgBytes, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("wp-config.php missing: %v", err)
	}
	cfgContent := string(cfgBytes)

	requiredStrings := []string{
		"define( 'DB_NAME', 'wp_blog' );",
		"define( 'DB_USER', 'wp_user' );",
		"define( 'DB_PASSWORD', 'wp_secret_pass' );",
		"define( 'DB_HOST', '127.0.0.1:3306' );",
		"$table_prefix = 'wp_';",
		"define( 'WP_DEBUG', false );",
		"require_once ABSPATH . 'wp-settings.php';",
		"define( 'AUTH_KEY',",
		"define( 'SECURE_AUTH_KEY',",
		"define( 'LOGGED_IN_KEY',",
		"define( 'NONCE_KEY',",
		"define( 'AUTH_SALT',",
		"define( 'SECURE_AUTH_SALT',",
		"define( 'LOGGED_IN_SALT',",
		"define( 'NONCE_SALT',",
	}
	for _, req := range requiredStrings {
		if !strings.Contains(cfgContent, req) {
			t.Errorf("wp-config.php missing expected substring: %q", req)
		}
	}

	// Verify extracted files exist
	if _, err := os.Stat(filepath.Join(site.Root, "index.php")); err != nil {
		t.Errorf("extracted index.php missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "wp-settings.php")); err != nil {
		t.Errorf("extracted wp-settings.php missing: %v", err)
	}
}

func TestInstallLaravelTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("laravel.example.com", "8.3")

	placeholder := filepath.Join(site.Root, "index.html")
	if err := os.WriteFile(placeholder, []byte("<h1>Placeholder</h1>"), 0o644); err != nil {
		t.Fatalf("write placeholder: %v", err)
	}

	opts := TemplateInstallOptions{
		Template: "laravel",
		DBName:   "laravel_db",
		DBUser:   "laravel_user",
		DBPass:   "laravel_pass",
		DBHost:   "db.local:3306",
	}

	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(laravel): %v", err)
	}

	// Verify placeholder is removed
	if _, err := os.Stat(placeholder); !os.IsNotExist(err) {
		t.Errorf("placeholder index.html still exists after install")
	}

	// Verify public/index.php
	pubIndex, err := os.ReadFile(filepath.Join(site.Root, "public", "index.php"))
	if err != nil {
		t.Fatalf("public/index.php missing: %v", err)
	}
	if !strings.Contains(string(pubIndex), "LARAVEL_START") {
		t.Errorf("public/index.php missing LARAVEL_START")
	}

	// Verify artisan script executable
	artisanPath := filepath.Join(site.Root, "artisan")
	fi, err := os.Stat(artisanPath)
	if err != nil {
		t.Fatalf("artisan missing: %v", err)
	}
	if fi.Mode()&0o111 == 0 {
		t.Errorf("artisan is not executable: mode is %v", fi.Mode())
	}

	// Verify .env
	envBytes, err := os.ReadFile(filepath.Join(site.Root, ".env"))
	if err != nil {
		t.Fatalf(".env missing: %v", err)
	}
	envStr := string(envBytes)
	if !strings.Contains(envStr, "APP_KEY=base64:") {
		t.Errorf(".env missing base64 APP_KEY")
	}
	if !strings.Contains(envStr, "DB_DATABASE=laravel_db") {
		t.Errorf(".env missing DB_DATABASE")
	}
	if !strings.Contains(envStr, "DB_USERNAME=laravel_user") {
		t.Errorf(".env missing DB_USERNAME")
	}
	if !strings.Contains(envStr, "DB_HOST=db.local") {
		t.Errorf(".env missing DB_HOST")
	}

	// Verify storage & cache dirs with 0775 mode
	dirs775 := []string{
		"storage/framework/views",
		"storage/framework/sessions",
		"storage/framework/cache",
		"storage/logs",
		"bootstrap/cache",
	}
	for _, d := range dirs775 {
		target := filepath.Join(site.Root, d)
		info, err := os.Stat(target)
		if err != nil {
			t.Errorf("directory %s missing: %v", d, err)
			continue
		}
		if !info.IsDir() {
			t.Errorf("%s is not a directory", d)
		}
		perm := info.Mode().Perm()
		if perm != 0o775 && perm != 0o777 {
			t.Errorf("directory %s expected mode 0775 or 0777, got %o", d, perm)
		}
	}

	// Verify config and routes
	if _, err := os.Stat(filepath.Join(site.Root, "bootstrap", "app.php")); err != nil {
		t.Errorf("bootstrap/app.php missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "config", "app.php")); err != nil {
		t.Errorf("config/app.php missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "config", "database.php")); err != nil {
		t.Errorf("config/database.php missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "routes", "web.php")); err != nil {
		t.Errorf("routes/web.php missing: %v", err)
	}
}

func TestInstallNextJSTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("nextjs.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "nextjs",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(nextjs): %v", err)
	}

	pkgBytes, err := os.ReadFile(filepath.Join(site.Root, "package.json"))
	if err != nil {
		t.Fatalf("package.json missing: %v", err)
	}
	if !strings.Contains(string(pkgBytes), `"next": "^16.`) {
		t.Errorf("package.json missing next 16 dependency")
	}
	if !strings.Contains(string(pkgBytes), `"react": "^19.0.0"`) {
		t.Errorf("package.json missing react 19 dependency")
	}

	if _, err := os.Stat(filepath.Join(site.Root, "next.config.mjs")); err != nil {
		t.Errorf("next.config.mjs missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "app", "layout.tsx")); err != nil {
		t.Errorf("app/layout.tsx missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "app", "page.tsx")); err != nil {
		t.Errorf("app/page.tsx missing: %v", err)
	}

	serverBytes, err := os.ReadFile(filepath.Join(site.Root, "server.js"))
	if err != nil {
		t.Fatalf("server.js missing: %v", err)
	}
	if !strings.Contains(string(serverBytes), "http.createServer") {
		t.Errorf("server.js missing http.createServer")
	}
}

func TestInstallDjangoTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("django.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "django",
		DBName:   "my_django_db",
		DBUser:   "my_django_user",
		DBPass:   "django_pass",
		DBHost:   "127.0.0.1:3306",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(django): %v", err)
	}

	manageFi, err := os.Stat(filepath.Join(site.Root, "manage.py"))
	if err != nil {
		t.Fatalf("manage.py missing: %v", err)
	}
	if manageFi.Mode()&0o111 == 0 {
		t.Errorf("manage.py is not executable")
	}

	settingsBytes, err := os.ReadFile(filepath.Join(site.Root, "myproject", "settings.py"))
	if err != nil {
		t.Fatalf("myproject/settings.py missing: %v", err)
	}
	settingsStr := string(settingsBytes)
	if !strings.Contains(settingsStr, "SECRET_KEY") {
		t.Errorf("settings.py missing SECRET_KEY")
	}
	if !strings.Contains(settingsStr, "'*'") {
		t.Errorf("settings.py missing ALLOWED_HOSTS = ['*']")
	}
	if !strings.Contains(settingsStr, "my_django_db") {
		t.Errorf("settings.py missing database name")
	}

	if _, err := os.Stat(filepath.Join(site.Root, "myproject", "urls.py")); err != nil {
		t.Errorf("myproject/urls.py missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "myproject", "wsgi.py")); err != nil {
		t.Errorf("myproject/wsgi.py missing: %v", err)
	}

	runFi, err := os.Stat(filepath.Join(site.Root, "run.sh"))
	if err != nil {
		t.Fatalf("run.sh missing: %v", err)
	}
	if runFi.Mode()&0o111 == 0 {
		t.Errorf("run.sh is not executable")
	}
	if _, err := os.Stat(filepath.Join(site.Root, "requirements.txt")); err != nil {
		t.Errorf("requirements.txt missing: %v", err)
	}
}

func TestInstallFlaskTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("flask.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "flask",
		DBName:   "flask_db",
		DBUser:   "flask_user",
		DBPass:   "flask_pass",
		DBHost:   "127.0.0.1:3306",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(flask): %v", err)
	}

	appPy, err := os.ReadFile(filepath.Join(site.Root, "app.py"))
	if err != nil {
		t.Fatalf("app.py missing: %v", err)
	}
	if !strings.Contains(string(appPy), "Flask 3") {
		t.Errorf("app.py missing Flask 3 branding")
	}
	if _, err := os.Stat(filepath.Join(site.Root, "wsgi.py")); err != nil {
		t.Errorf("wsgi.py missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "requirements.txt")); err != nil {
		t.Errorf("requirements.txt missing: %v", err)
	}
}

func TestInstallDockerTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("docker.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "docker",
		DBName:   "app_db",
		DBUser:   "app_user",
		DBPass:   "app_pass",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(docker): %v", err)
	}

	dockerfile, err := os.ReadFile(filepath.Join(site.Root, "Dockerfile"))
	if err != nil {
		t.Fatalf("Dockerfile missing: %v", err)
	}
	if !strings.Contains(string(dockerfile), "FROM node") {
		t.Errorf("Dockerfile missing node base image")
	}

	compose, err := os.ReadFile(filepath.Join(site.Root, "docker-compose.yml"))
	if err != nil {
		t.Fatalf("docker-compose.yml missing: %v", err)
	}
	if !strings.Contains(string(compose), "services:") {
		t.Errorf("docker-compose.yml missing services block")
	}
}

func TestInstallSpringBootTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("spring.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "springboot",
		DBName:   "spring_db",
		DBUser:   "spring_user",
		DBPass:   "spring_pass",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err != nil {
		t.Fatalf("InstallTemplate(springboot): %v", err)
	}

	pom, err := os.ReadFile(filepath.Join(site.Root, "pom.xml"))
	if err != nil {
		t.Fatalf("pom.xml missing: %v", err)
	}
	if !strings.Contains(string(pom), "spring-boot-starter-parent") {
		t.Errorf("pom.xml missing spring-boot-starter-parent")
	}

	if _, err := os.Stat(filepath.Join(site.Root, "src", "main", "java", "com", "example", "demo", "Application.java")); err != nil {
		t.Errorf("Application.java missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(site.Root, "src", "main", "resources", "application.properties")); err != nil {
		t.Errorf("application.properties missing: %v", err)
	}
}

func TestInstallInvalidTemplate(t *testing.T) {
	h := newHarness(t, nil)
	site := h.addSite("invalid.example.com", "none")

	opts := TemplateInstallOptions{
		Template: "unsupported_xyz",
	}
	_, err := h.svc.InstallTemplate(context.Background(), site.Domain, opts)
	if err == nil {
		t.Fatalf("expected error for unsupported template, got nil")
	}
}
