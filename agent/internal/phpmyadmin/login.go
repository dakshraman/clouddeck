package phpmyadmin

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const loginTimeout = 6 * time.Second

// Input extraction patterns supporting any attribute order and single/double quotes.
var (
	inputTagRe  = regexp.MustCompile(`(?is)<input\b[^>]*>`)
	inputNameRe = regexp.MustCompile(`(?i)\bname\s*=\s*["']?([^"' >]+)`)
	inputValRe  = regexp.MustCompile(`(?i)\bvalue\s*=\s*["']?([^"'>]*)`)
)

func extractLoginFields(page string) (token, session string) {
	for _, tag := range inputTagRe.FindAllString(page, -1) {
		nameMatch := inputNameRe.FindStringSubmatch(tag)
		if len(nameMatch) < 2 {
			continue
		}
		name := strings.ToLower(nameMatch[1])
		if name != "token" && name != "set_session" {
			continue
		}
		valMatch := inputValRe.FindStringSubmatch(tag)
		if len(valMatch) >= 2 {
			val := valMatch[1]
			if name == "token" && token == "" {
				token = val
			} else if name == "set_session" && session == "" {
				session = val
			}
		}
	}
	return token, session
}

// Cookie is a phpMyAdmin cookie that should be handed to the browser.
type Cookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path,omitempty"`
	MaxAge   int    `json:"maxAge,omitempty"`
	HttpOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
	SameSite string `json:"sameSite,omitempty"`
}

// Login is the /v1/phpmyadmin/login response.
type LoginResult struct {
	Port    int      `json:"port"`
	URLPath string   `json:"urlPath"`
	Cookies []Cookie `json:"cookies"`
}

// Login authenticates to phpMyAdmin's cookie-auth login using the agent's
// MySQL root credentials and returns the cookies for the browser. The
// credentials never leave the agent.
func (s *Service) Login(ctx context.Context) (LoginResult, error) {
	st := s.Status()
	if !st.Installed {
		return LoginResult{}, errors.New("phpMyAdmin is not installed")
	}
	out := LoginResult{Port: st.Port, URLPath: st.URLPath, Cookies: []Cookie{}}
	if st.AuthType != "" && st.AuthType != "cookie" {
		// config/signon/http auth either logs in without a form or is handled
		// by phpMyAdmin itself; the URL is enough.
		return out, nil
	}

	base := fmt.Sprintf("http://127.0.0.1:%d%s", st.Port, st.URLPath)
	jar, err := cookiejar.New(nil)
	if err != nil {
		return LoginResult{}, err
	}
	client := &http.Client{
		Jar:     jar,
		Timeout: loginTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	page, loginCookies, err := getLoginPage(ctx, client, base+"index.php?lang=en")
	if err != nil {
		return LoginResult{}, err
	}
	browserCookies := collectCookies(loginCookies)
	token, session := extractLoginFields(page)
	if session == "" {
		if cookie, ok := browserCookies["phpMyAdmin"]; ok && cookie.Value != "" {
			session = cookie.Value
		}
	}
	if token == "" || session == "" {
		return LoginResult{}, errors.New("phpMyAdmin login token not found")
	}

	user, password := s.loginCredentials()
	form := url.Values{}
	form.Set("pma_username", user)
	form.Set("pma_password", password)
	form.Set("server", "1")
	form.Set("target", "index.php")
	form.Set("set_session", session)
	form.Set("token", token)
	form.Set("lang", "en")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"index.php", strings.NewReader(form.Encode()))
	if err != nil {
		return LoginResult{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := client.Do(req)
	if err != nil {
		return LoginResult{}, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode >= http.StatusBadRequest {
		return LoginResult{}, fmt.Errorf("phpMyAdmin login returned %s", resp.Status)
	}

	for _, cookie := range resp.Cookies() {
		browserCookies[cookie.Name] = browserCookie(cookie)
	}
	authed := false
	for _, cookie := range browserCookies {
		if strings.HasPrefix(cookie.Name, "pmaAuth-") {
			authed = true
		}
	}
	if !authed {
		return LoginResult{}, errors.New("phpMyAdmin login failed; check MySQL credentials")
	}
	for _, cookie := range browserCookies {
		out.Cookies = append(out.Cookies, cookie)
	}
	return out, nil
}

func getLoginPage(ctx context.Context, client *http.Client, url string) (string, []*http.Cookie, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return "", nil, fmt.Errorf("phpMyAdmin login page returned %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", nil, err
	}
	return string(body), resp.Cookies(), nil
}

func collectCookies(cookies []*http.Cookie) map[string]Cookie {
	out := make(map[string]Cookie, len(cookies))
	for _, cookie := range cookies {
		out[cookie.Name] = browserCookie(cookie)
	}
	return out
}

func browserCookie(cookie *http.Cookie) Cookie {
	return Cookie{
		Name:     cookie.Name,
		Value:    cookie.Value,
		Path:     cookie.Path,
		MaxAge:   cookie.MaxAge,
		HttpOnly: cookie.HttpOnly,
		Secure:   cookie.Secure,
		SameSite: sameSiteName(cookie.SameSite),
	}
}

func sameSiteName(mode http.SameSite) string {
	switch mode {
	case http.SameSiteStrictMode:
		return "strict"
	case http.SameSiteLaxMode:
		return "lax"
	case http.SameSiteNoneMode:
		return "none"
	default:
		return ""
	}
}
