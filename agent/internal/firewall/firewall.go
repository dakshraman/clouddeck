// Package firewall manages host firewall rules through ufw (Debian/Ubuntu) or
// firewalld (RHEL/AlmaLinux), plus a read-only view of the active ruleset.
package firewall

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/store"
)

// Backends.
const (
	BackendUFW       = "ufw"
	BackendFirewalld = "firewalld"
	BackendNone      = "none"
)

// Rule actions.
const (
	ActionAllow = "allow"
	ActionDeny  = "deny"
)

var fromRe = regexp.MustCompile(`^[0-9a-fA-F:.]{2,45}(/\d{1,3})?$`)

// Service manages firewall state and rules.
type Service struct {
	st    *store.Store
	cfg   config.Config
	audit *audit.Log
}

// New creates the firewall service.
func New(st *store.Store, cfg config.Config, auditLog *audit.Log) *Service {
	return &Service{st: st, cfg: cfg, audit: auditLog}
}

// Status describes the host firewall.
type Status struct {
	Backend   string            `json:"backend"`
	Available bool              `json:"available"`
	Enabled   bool              `json:"enabled"`
	Detail    string            `json:"detail,omitempty"`
	Defaults  map[string]string `json:"defaults,omitempty"`
	Rules     []store.FirewallRule `json:"rules"`
}

// Detect reports which firewall backend this host runs.
func Detect() string {
	if _, err := exec.LookPath("ufw"); err == nil {
		return BackendUFW
	}
	if _, err := exec.LookPath("firewall-cmd"); err == nil {
		return BackendFirewalld
	}
	return BackendNone
}

// Status returns the firewall state plus every managed rule.
func (s *Service) Status(ctx context.Context) Status {
	backend := Detect()
	status := Status{Backend: backend, Rules: nonNil(s.st.ListFirewallRules())}
	switch backend {
	case BackendUFW:
		status.Available = true
		out, err := exec.CommandContext(ctx, "ufw", "status", "verbose").CombinedOutput()
		if err != nil {
			status.Detail = strings.TrimSpace(string(out))
			break
		}
		text := string(out)
		status.Enabled = strings.Contains(text, "Status: active")
		status.Defaults = map[string]string{}
		for _, line := range strings.Split(text, "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "Default:") {
				status.Detail = trimmed
			}
		}
	case BackendFirewalld:
		status.Available = true
		out, err := exec.CommandContext(ctx, "firewall-cmd", "--state").CombinedOutput()
		if err != nil {
			status.Detail = strings.TrimSpace(string(out))
			break
		}
		status.Enabled = strings.TrimSpace(string(out)) == "running"
	default:
		status.Detail = "no supported firewall (ufw or firewalld) is installed"
	}
	return status
}

// AddRule validates and applies one rule, then persists it.
func (s *Service) AddRule(ctx context.Context, log safeexec.Logger, in store.FirewallRule) (store.FirewallRule, error) {
	backend := Detect()
	if backend == BackendNone {
		return store.FirewallRule{}, apierr.BadRequest("firewall_unavailable",
			"no supported firewall is installed (ufw or firewalld)")
	}
	if in.Port < 1 || in.Port > 65535 {
		return store.FirewallRule{}, apierr.BadRequest("invalid_port", fmt.Sprintf("port %d is outside 1-65535", in.Port))
	}
	protocol := strings.ToLower(strings.TrimSpace(in.Protocol))
	if protocol == "" {
		protocol = "tcp"
	}
	if protocol != "tcp" && protocol != "udp" {
		return store.FirewallRule{}, apierr.BadRequest("invalid_protocol", "protocol must be tcp or udp")
	}
	action := strings.ToLower(strings.TrimSpace(in.Action))
	if action == "" {
		action = ActionAllow
	}
	if action != ActionAllow && action != ActionDeny {
		return store.FirewallRule{}, apierr.BadRequest("invalid_action", "action must be allow or deny")
	}
	from := strings.TrimSpace(in.From)
	if from != "" {
		if _, _, err := net.ParseCIDR(from); err != nil {
			if net.ParseIP(from) == nil || !fromRe.MatchString(from) {
				return store.FirewallRule{}, apierr.BadRequest("invalid_source", fmt.Sprintf("invalid source address %q", from))
			}
		}
	}
	rule := store.FirewallRule{
		ID:        strconv.FormatInt(store.Now().UnixNano(), 36),
		Port:      in.Port,
		Protocol:  protocol,
		Action:    action,
		From:      from,
		Comment:   strings.TrimSpace(in.Comment),
		CreatedAt: store.Now(),
	}

	if err := s.apply(ctx, log, rule, backend); err != nil {
		return store.FirewallRule{}, err
	}
	if err := s.st.AddFirewallRule(rule); err != nil {
		// Roll the live rule back so state and host stay in sync.
		_ = s.remove(ctx, log, rule, backend)
		return store.FirewallRule{}, apierr.Conflict("rule_exists", fmt.Sprintf("port %d/%s rule already exists", rule.Port, rule.Protocol))
	}
	s.record("firewall.rule.add", rule)
	return rule, nil
}

// DeleteRule removes a rule from the host and state.
func (s *Service) DeleteRule(ctx context.Context, log safeexec.Logger, id string) error {
	rules := s.st.ListFirewallRules()
	var found *store.FirewallRule
	for i := range rules {
		if rules[i].ID == id {
			found = &rules[i]
			break
		}
	}
	if found == nil {
		return apierr.NotFound("rule_not_found", fmt.Sprintf("firewall rule %q does not exist", id))
	}
	if err := s.remove(ctx, log, *found, Detect()); err != nil {
		return err
	}
	if err := s.st.DeleteFirewallRule(id); err != nil {
		return apierr.Internal(fmt.Sprintf("remove rule from state: %v", err))
	}
	s.record("firewall.rule.delete", *found)
	return nil
}

func (s *Service) apply(ctx context.Context, log safeexec.Logger, rule store.FirewallRule, backend string) error {
	if backend == BackendFirewalld {
		args := []string{"--permanent"}
		if rule.From != "" {
			args = append(args, "--add-source="+rule.From)
			if rule.Action == ActionDeny {
				// firewalld has no direct deny-source; a drop zone is the closest match.
				args = append(args, "--zone=drop")
			} else {
				args = append(args, "--zone=trusted")
			}
		} else {
			args = append(args, fmt.Sprintf("--add-port=%d/%s", rule.Port, rule.Protocol))
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "firewall-cmd", args...); err != nil {
			return apierr.Internal(fmt.Sprintf("apply firewall rule: %v", err))
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "firewall-cmd", "--reload"); err != nil {
			return apierr.Internal(fmt.Sprintf("reload firewalld: %v", err))
		}
		return nil
	}

	args := []string{rule.Action}
	if rule.From != "" {
		args = append(args, "from", rule.From)
	}
	args = append(args, fmt.Sprintf("%d/%s", rule.Port, rule.Protocol))
	if rule.Comment != "" {
		args = append(args, "comment", rule.Comment)
	}
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "ufw", args...); err != nil {
		return apierr.Internal(fmt.Sprintf("apply firewall rule: %v", err))
	}
	return nil
}

func (s *Service) remove(ctx context.Context, log safeexec.Logger, rule store.FirewallRule, backend string) error {
	if backend == BackendFirewalld {
		args := []string{"--permanent"}
		if rule.From != "" {
			args = append(args, "--remove-source="+rule.From)
			if rule.Action == ActionDeny {
				args = append(args, "--zone=drop")
			} else {
				args = append(args, "--zone=trusted")
			}
		} else {
			args = append(args, fmt.Sprintf("--remove-port=%d/%s", rule.Port, rule.Protocol))
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "firewall-cmd", args...); err != nil {
			return apierr.Internal(fmt.Sprintf("remove firewall rule: %v", err))
		}
		_ = safeexec.Run(ctx, s.cfg.DryRun, log, "firewall-cmd", "--reload")
		return nil
	}
	if backend == BackendNone {
		return nil
	}
	args := []string{"delete", rule.Action}
	if rule.From != "" {
		args = append(args, "from", rule.From)
	}
	args = append(args, fmt.Sprintf("%d/%s", rule.Port, rule.Protocol))
	if err := safeexec.Run(ctx, s.cfg.DryRun, log, "ufw", args...); err != nil {
		return apierr.Internal(fmt.Sprintf("remove firewall rule: %v", err))
	}
	return nil
}

// SetEnabled turns the host firewall on or off.
func (s *Service) SetEnabled(ctx context.Context, log safeexec.Logger, enabled bool) (Status, error) {
	backend := Detect()
	switch backend {
	case BackendUFW:
		arg := "disable"
		if enabled {
			arg = "enable"
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "ufw", "--force", arg); err != nil {
			return Status{}, apierr.Internal(fmt.Sprintf("set ufw state: %v", err))
		}
	case BackendFirewalld:
		arg := "--stop"
		if enabled {
			arg = "--start"
		}
		if err := safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", map[bool]string{true: "start", false: "stop"}[enabled], "firewalld"); err != nil {
			_ = arg
			return Status{}, apierr.Internal(fmt.Sprintf("set firewalld state: %v", err))
		}
	default:
		return Status{}, apierr.BadRequest("firewall_unavailable", "no supported firewall is installed")
	}
	return s.Status(ctx), nil
}

func (s *Service) record(action string, rule store.FirewallRule) {
	_ = s.audit.Append(audit.Record{
		Action: action,
		Params: map[string]any{"port": rule.Port, "protocol": rule.Protocol, "action": rule.Action, "from": rule.From},
		Result: audit.ResultAccepted,
	})
}

func nonNil[T any](in []T) []T {
	if in == nil {
		return []T{}
	}
	return in
}
