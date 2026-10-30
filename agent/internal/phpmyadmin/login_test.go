package phpmyadmin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"

	"clouddeck/agent/internal/config"
)

func TestLoginLogsInThroughCookieAuth(t *testing.T) {
	var posted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/phpmyadmin_abc123/" && r.Method == http.MethodGet:
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodGet:
			http.SetCookie(w, &http.Cookie{
				Name:     "phpMyAdmin",
				Value:    "session-1",
				Path:     "/phpmyadmin_abc123/",
				HttpOnly: true,
				SameSite: http.SameSiteStrictMode,
			})
			fmt.Fprint(w, `<form method="post">`+
				`<input type="hidden" name="set_session" value="session-1">`+
				`<input type="hidden" name="token" value="token-1">`+
				`</form>`)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodPost:
			if err := r.ParseForm(); err != nil {
				t.Errorf("parse login form: %v", err)
			}
			posted = r.PostForm
			http.SetCookie(w, &http.Cookie{
				Name:     "pmaAuth-1",
				Value:    "auth-1",
				Path:     "/phpmyadmin_abc123/",
				HttpOnly: true,
				MaxAge:   3600,
				SameSite: http.SameSiteStrictMode,
			})
			http.Redirect(w, r, "/phpmyadmin_abc123/index.php", http.StatusFound)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv))
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n")
	svc := New(config.Config{
		PHPMYADMINDir: dir,
		MySQLRootUser: "root",
		MySQLRootPass: "s3cret",
	})

	login, err := svc.Login(context.Background())
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if login.Port != serverPort(t, srv) {
		t.Errorf("Port = %d, want %d", login.Port, serverPort(t, srv))
	}
	if login.URLPath != "/phpmyadmin_abc123/" {
		t.Errorf("URLPath = %q, want /phpmyadmin_abc123/", login.URLPath)
	}
	if posted.Get("pma_username") != "root" {
		t.Errorf("pma_username = %q, want root", posted.Get("pma_username"))
	}
	if posted.Get("pma_password") != "s3cret" {
		t.Errorf("pma_password = %q, want s3cret", posted.Get("pma_password"))
	}
	if posted.Get("set_session") != "session-1" {
		t.Errorf("set_session = %q, want session-1", posted.Get("set_session"))
	}
	if posted.Get("token") != "token-1" {
		t.Errorf("token = %q, want token-1", posted.Get("token"))
	}
	if posted.Get("server") != "1" {
		t.Errorf("server = %q, want 1", posted.Get("server"))
	}

	auth := findCookie(login.Cookies, "pmaAuth-1")
	if auth == nil {
		t.Fatalf("Cookies = %+v, want pmaAuth-1", login.Cookies)
	}
	if auth.Value != "auth-1" {
		t.Errorf("pmaAuth-1 value = %q, want auth-1", auth.Value)
	}
	if auth.Path != "/phpmyadmin_abc123/" {
		t.Errorf("pmaAuth-1 path = %q, want /phpmyadmin_abc123/", auth.Path)
	}
	if !auth.HttpOnly {
		t.Error("pmaAuth-1 HttpOnly = false, want true")
	}
	if auth.MaxAge != 3600 {
		t.Errorf("pmaAuth-1 MaxAge = %d, want 3600", auth.MaxAge)
	}
	if auth.SameSite != "strict" {
		t.Errorf("pmaAuth-1 SameSite = %q, want strict", auth.SameSite)
	}

	session := findCookie(login.Cookies, "phpMyAdmin")
	if session == nil || session.Value != "session-1" {
		t.Errorf("Cookies = %+v, want phpMyAdmin=session-1", login.Cookies)
	}
}

func TestLoginRejectsMissingToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/phpmyadmin_abc123/" {
			w.WriteHeader(http.StatusOK)
			return
		}
		fmt.Fprint(w, `<form method="post"></form>`)
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv))
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n")
	svc := New(config.Config{PHPMYADMINDir: dir, MySQLRootUser: "root", MySQLRootPass: "s3cret"})

	if _, err := svc.Login(context.Background()); err == nil {
		t.Fatal("Login succeeded without a login token")
	}
}

func TestLoginRejectsWrongCredentials(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/phpmyadmin_abc123/" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `<input type="hidden" name="set_session" value="session-1">`+
				`<input type="hidden" name="token" value="token-1">`)
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `<form id="loginform"></form>`)
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv))
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n")
	svc := New(config.Config{PHPMYADMINDir: dir, MySQLRootUser: "root", MySQLRootPass: "wrong"})

	if _, err := svc.Login(context.Background()); err == nil {
		t.Fatal("Login succeeded with a rejected credential posted")
	}
}

func TestLoginReversedAttributeOrderAndSingleQuotes(t *testing.T) {
	var posted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/phpmyadmin_abc123/" && r.Method == http.MethodGet:
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodGet:
			fmt.Fprint(w, `<form method="post">`+
				`<input type='hidden' value='session-rev' name='set_session'>`+
				`<input type="hidden" value="token-rev" name="token">`+
				`</form>`)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodPost:
			_ = r.ParseForm()
			posted = r.PostForm
			http.SetCookie(w, &http.Cookie{
				Name:  "pmaAuth-1",
				Value: "auth-1",
				Path:  "/phpmyadmin_abc123/",
			})
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv))
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n")
	svc := New(config.Config{
		PHPMYADMINDir: dir,
		MySQLRootUser: "root",
		MySQLRootPass: "pw",
	})

	_, err := svc.Login(context.Background())
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if posted.Get("token") != "token-rev" || posted.Get("set_session") != "session-rev" {
		t.Fatalf("posted token=%q, session=%q; want token-rev, session-rev",
			posted.Get("token"), posted.Get("set_session"))
	}
}

func TestLoginSessionFromCookieFallback(t *testing.T) {
	var posted url.Values
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/phpmyadmin_abc123/" && r.Method == http.MethodGet:
			w.WriteHeader(http.StatusOK)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodGet:
			http.SetCookie(w, &http.Cookie{
				Name:  "phpMyAdmin",
				Value: "cookie-session-id",
				Path:  "/phpmyadmin_abc123/",
			})
			// Form only has token, no set_session input.
			fmt.Fprint(w, `<form method="post"><input type="hidden" name="token" value="tok123"></form>`)
		case r.URL.Path == "/phpmyadmin_abc123/index.php" && r.Method == http.MethodPost:
			_ = r.ParseForm()
			posted = r.PostForm
			http.SetCookie(w, &http.Cookie{
				Name:  "pmaAuth-1",
				Value: "auth-1",
				Path:  "/phpmyadmin_abc123/",
			})
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	dir := installDir(t, serverPort(t, srv))
	writeTestFile(t, filepath.Join(dir, "phpmyadmin_abc123", "config.inc.php"),
		"<?php\n$cfg['Servers'][$i]['auth_type'] = 'cookie';\n")
	svc := New(config.Config{
		PHPMYADMINDir: dir,
		MySQLRootUser: "root",
		MySQLRootPass: "pw",
	})

	_, err := svc.Login(context.Background())
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if posted.Get("set_session") != "cookie-session-id" {
		t.Fatalf("posted set_session=%q; want cookie-session-id", posted.Get("set_session"))
	}
}

func findCookie(cookies []Cookie, name string) *Cookie {
	for i := range cookies {
		if cookies[i].Name == name {
			return &cookies[i]
		}
	}
	return nil
}
