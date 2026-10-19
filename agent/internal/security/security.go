// Package security reports the host's security posture: the ModSecurity engine
// and OWASP CRS, fail2ban jails and banned addresses, SSH hardening and a
// short audit checklist the panel renders on its Security page.
package security

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"clouddeck/agent/internal/config"
)

// Check statuses.
const (
	CheckPass = "pass"
	CheckWarn = "warn"
	CheckFail = "fail"
	CheckInfo = "info"
)

// Modsec describes the ModSecurity installation.
type Modsec struct {
	ModuleInstalled bool   `json:"moduleInstalled"`
	ModulePath      string `json:"modulePath,omitempty"`
	CRSInstalled    bool   `json:"crsInstalled"`
	CRSPath         string `json:"crsPath,omitempty"`
	Engine          string `json:"engine"` // modsecurity | nginx-rules | none
	Note            string `json:"note,omitempty"`
}

// Jail is one fail2ban jail.
type Jail struct {
	Name    string   `json:"name"`
	Banned  int      `json:"banned"`
	Total   int      `json:"total"`
	IPs     []string `json:"ips"`
	Enabled bool     `json:"enabled"`
}

// Fail2ban describes the fail2ban daemon.
type Fail2ban struct {
	Installed bool   `json:"installed"`
	Active    bool   `json:"active"`
	Jails     []Jail `json:"jails"`
	Note      string `json:"note,omitempty"`
}

// SSH is the effective SSH daemon posture.
type SSH struct {
	Port                   string `json:"port"`
	PermitRootLogin        string `json:"permitRootLogin"`
	PasswordAuthentication string `json:"passwordAuthentication"`
	PubkeyAuthentication   string `json:"pubkeyAuthentication"`
}

// Check is one audit result.
type Check struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Status string `json:"status"`
	Detail string `json:"detail"`
	Hint   string `json:"hint,omitempty"`
}

// Status is the full security overview.
type Status struct {
	Modsec   Modsec   `json:"modsec"`
	Fail2ban Fail2ban `json:"fail2ban"`
	SSH      SSH      `json:"ssh"`
	Checks   []Check  `json:"checks"`
}

// Service reports security state.
type Service struct {
	cfg config.Config
}

// New creates the security service.
func New(cfg config.Config) *Service {
	return &Service{cfg: cfg}
}

var bannedRe = regexp.MustCompile(`Banned IP list:\s*(.*)`)

// Status collects the host security overview.
func (s *Service) Status(ctx context.Context) Status {
	status := Status{
		Modsec:   detectModsec(s.cfg),
		Fail2ban: detectFail2ban(ctx),
		SSH:      readSSH(),
	}
	status.Checks = audit(status)
	return status
}

// Unban removes one address from a fail2ban jail.
func (s *Service) Unban(ctx context.Context, jail, ip string) error {
	if jail == "" || ip == "" {
		return errBadInput("jail and ip are required")
	}
	if strings.ContainsAny(jail, " \t\n/") || strings.ContainsAny(ip, " \t\n/") {
		return errBadInput("invalid jail or ip")
	}
	cmd := exec.CommandContext(ctx, "fail2ban-client", "set", jail, "unbanip", ip)
	if out, err := cmd.CombinedOutput(); err != nil {
		return errBadInput(strings.TrimSpace(string(out)))
	}
	return nil
}

// SetJailEnabled enables or disables one fail2ban jail at runtime.
func (s *Service) SetJailEnabled(ctx context.Context, jail string, enabled bool) error {
	if jail == "" || strings.ContainsAny(jail, " \t\n/") {
		return errBadInput("invalid jail")
	}
	action := "stop"
	if enabled {
		action = "start"
	}
	cmd := exec.CommandContext(ctx, "fail2ban-client", "set", jail, action)
	if out, err := cmd.CombinedOutput(); err != nil {
		return errBadInput(strings.TrimSpace(string(out)))
	}
	return nil
}

type badInput string

func (e badInput) Error() string { return string(e) }

func errBadInput(msg string) error { return badInput(msg) }

func detectModsec(cfg config.Config) Modsec {
	mod := Modsec{Engine: "none"}
	modulePaths := []string{
		"/usr/lib/nginx/modules/ngx_http_modsecurity_module.so",
		"/usr/lib64/nginx/modules/ngx_http_modsecurity_module.so",
		"/etc/nginx/modules/ngx_http_modsecurity_module.so",
	}
	for _, path := range modulePaths {
		if _, err := os.Stat(path); err == nil {
			mod.ModuleInstalled = true
			mod.ModulePath = path
			break
		}
	}
	if !mod.ModuleInstalled {
		// nginx -V lists statically compiled or third-party modules.
		if out, err := exec.Command(cfg.NginxBin, "-V").CombinedOutput(); err == nil {
			if strings.Contains(string(out), "modsecurity") {
				mod.ModuleInstalled = true
				mod.ModulePath = "compiled into nginx"
			}
		}
	}
	for _, dir := range []string{"/usr/share/modsecurity-crs", "/etc/modsecurity/crs", "/etc/nginx/modsecurity"} {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			mod.CRSInstalled = true
			mod.CRSPath = dir
			break
		}
	}
	switch {
	case mod.ModuleInstalled:
		mod.Engine = "modsecurity"
		mod.Note = "ModSecurity module detected; sites can run the OWASP Core Rule Set."
		if !mod.CRSInstalled {
			mod.Note = "ModSecurity module detected, but the OWASP Core Rule Set is not installed."
		}
	case mod.CRSInstalled:
		mod.Engine = "nginx-rules"
		mod.Note = "Core Rule Set files found, but the nginx ModSecurity module is not loaded; CloudDeck uses its built-in nginx WAF rules."
	default:
		mod.Engine = "nginx-rules"
		mod.Note = "ModSecurity is not installed. CloudDeck's built-in nginx WAF rules are used for per-site protection."
	}
	return mod
}

func detectFail2ban(ctx context.Context) Fail2ban {
	f2b := Fail2ban{Jails: []Jail{}}
	if _, err := exec.LookPath("fail2ban-client"); err != nil {
		f2b.Note = "fail2ban is not installed. Install it to ban brute-force addresses automatically."
		return f2b
	}
	f2b.Installed = true
	out, err := exec.CommandContext(ctx, "fail2ban-client", "status").CombinedOutput()
	if err != nil {
		f2b.Note = "fail2ban is installed but not running: " + strings.TrimSpace(string(out))
		return f2b
	}
	f2b.Active = true
	jails := parseJailList(string(out))
	for _, name := range jails {
		jail := Jail{Name: name, IPs: []string{}, Enabled: true}
		detail, err := exec.CommandContext(ctx, "fail2ban-client", "status", name).CombinedOutput()
		if err == nil {
			jail.Banned, jail.Total, jail.IPs = parseJailStatus(string(detail))
		}
		f2b.Jails = append(f2b.Jails, jail)
	}
	return f2b
}

func parseJailList(out string) []string {
	for _, line := range strings.Split(out, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "Jail list:") {
			raw := strings.TrimSpace(strings.TrimPrefix(trimmed, "Jail list:"))
			if raw == "" {
				return []string{}
			}
			parts := strings.Split(raw, ",")
			jails := make([]string, 0, len(parts))
			for _, part := range parts {
				if name := strings.TrimSpace(part); name != "" {
					jails = append(jails, name)
				}
			}
			sort.Strings(jails)
			return jails
		}
	}
	return []string{}
}

func parseJailStatus(out string) (banned, total int, ips []string) {
	ips = []string{}
	for _, line := range strings.Split(out, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "Currently banned:"):
			banned, _ = strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(trimmed, "Currently banned:")))
		case strings.HasPrefix(trimmed, "Total banned:"):
			total, _ = strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(trimmed, "Total banned:")))
		case bannedRe.MatchString(trimmed):
			raw := strings.TrimSpace(bannedRe.FindStringSubmatch(trimmed)[1])
			if raw == "" {
				continue
			}
			for _, ip := range strings.Split(raw, ",") {
				if value := strings.TrimSpace(ip); value != "" {
					ips = append(ips, value)
				}
			}
		}
	}
	return banned, total, ips
}

func readSSH() SSH {
	ssh := SSH{
		Port:                   "22",
		PermitRootLogin:        "prohibit-password",
		PasswordAuthentication: "yes",
		PubkeyAuthentication:   "yes",
	}
	files := []string{"/etc/ssh/sshd_config"}
	dropIns, _ := filepath.Glob("/etc/ssh/sshd_config.d/*.conf")
	sort.Strings(dropIns)
	files = append(files, dropIns...)

	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			key := strings.ToLower(fields[0])
			value := strings.Trim(fields[1], `"`)
			switch key {
			case "port":
				ssh.Port = value
			case "permitrootlogin":
				ssh.PermitRootLogin = strings.ToLower(value)
			case "passwordauthentication":
				ssh.PasswordAuthentication = strings.ToLower(value)
			case "pubkeyauthentication":
				ssh.PubkeyAuthentication = strings.ToLower(value)
			}
		}
	}
	return ssh
}

func audit(status Status) []Check {
	checks := []Check{
		{
			ID:    "modsecurity",
			Label: "Web application firewall",
			Hint:  "Install libnginx-mod-http-modsecurity and the OWASP CRS, then enable the ModSecurity engine per site.",
		},
		{
			ID:    "fail2ban",
			Label: "Brute-force protection",
			Hint:  "Install fail2ban (apt install fail2ban) and enable the sshd and nginx jails.",
		},
		{
			ID:    "ssh-root",
			Label: "SSH root login",
			Hint:  "Set PermitRootLogin no in /etc/ssh/sshd_config and reload sshd.",
		},
		{
			ID:    "ssh-password",
			Label: "SSH password authentication",
			Hint:  "Prefer key-based SSH: set PasswordAuthentication no once keys are in place.",
		},
	}

	if status.Modsec.ModuleInstalled {
		checks[0].Status = CheckPass
		checks[0].Detail = "ModSecurity module is loaded."
		if !status.Modsec.CRSInstalled {
			checks[0].Status = CheckWarn
			checks[0].Detail = "ModSecurity is loaded, but the OWASP Core Rule Set is missing."
		}
	} else {
		checks[0].Status = CheckWarn
		checks[0].Detail = "ModSecurity is not installed; CloudDeck's built-in nginx WAF rules are available per site."
	}

	if status.Fail2ban.Active {
		checks[1].Status = CheckPass
		checks[1].Detail = strconv.Itoa(len(status.Fail2ban.Jails)) + " jail(s) active."
	} else if status.Fail2ban.Installed {
		checks[1].Status = CheckFail
		checks[1].Detail = "fail2ban is installed but not running."
	} else {
		checks[1].Status = CheckWarn
		checks[1].Detail = "fail2ban is not installed."
	}

	switch status.SSH.PermitRootLogin {
	case "no":
		checks[2].Status = CheckPass
		checks[2].Detail = "Root login is disabled."
	case "prohibit-password", "without-password", "forced-commands-only":
		checks[2].Status = CheckWarn
		checks[2].Detail = "Root may log in with a key only."
	default:
		checks[2].Status = CheckFail
		checks[2].Detail = "Root may log in with a password."
	}

	if status.SSH.PasswordAuthentication == "no" {
		checks[3].Status = CheckPass
		checks[3].Detail = "Password logins are disabled."
	} else {
		checks[3].Status = CheckWarn
		checks[3].Detail = "Password logins are enabled."
	}

	return checks
}
