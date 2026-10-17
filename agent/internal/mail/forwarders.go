package mail

import (
	"fmt"
	"sort"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/sites"
)

// Audit actions owned by the forwarder endpoints.
const (
	actionForwarderCreate = "mail.forwarder.create"
	actionForwarderDelete = "mail.forwarder.delete"
)

// ListForwarders lists aliases, optionally filtered by source domain.
// Results are sorted by source.
func (s *Service) ListForwarders(domain string) ([]Forwarder, error) {
	filter := ""
	if strings.TrimSpace(domain) != "" {
		normalized, err := sites.ValidateDomain(domain)
		if err != nil {
			return nil, err
		}
		filter = normalized
	}
	lines, err := readLines(s.cfg.MailAliasesFile)
	if err != nil {
		return nil, apierr.Internal(fmt.Sprintf("read aliases file: %v", err))
	}
	createdAt := modTime(s.cfg.MailAliasesFile)
	forwarders := make([]Forwarder, 0, len(lines))
	for _, line := range lines {
		source, target, ok := parseAliasLine(line)
		if !ok {
			continue
		}
		if filter != "" && domainOf(source) != filter {
			continue
		}
		forwarders = append(forwarders, Forwarder{Source: source, Target: target, CreatedAt: createdAt})
	}
	sort.Slice(forwarders, func(i, j int) bool { return forwarders[i].Source < forwarders[j].Source })
	return forwarders, nil
}

// parseAliasLine decodes one Postfix virtual-alias line
// "source target1, target2"; false for blank lines, comments and malformed
// entries. Lines that do not parse are preserved verbatim on rewrite.
func parseAliasLine(line string) (source, target string, ok bool) {
	line = strings.TrimSpace(strings.TrimRight(line, "\r"))
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false
	}
	i := strings.IndexAny(line, " \t")
	if i < 0 {
		return "", "", false
	}
	source = strings.ToLower(line[:i])
	target = strings.TrimSpace(line[i+1:])
	if target == "" {
		return "", "", false
	}
	return source, target, true
}

// splitTargets splits a comma-separated target list and drops empty items.
func splitTargets(raw string) []string {
	parts := strings.Split(raw, ",")
	targets := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			targets = append(targets, part)
		}
	}
	return targets
}

// CreateForwarder adds one alias entry.
func (s *Service) CreateForwarder(source, target string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	params := map[string]any{"source": source, "target": target}
	normalizedSource, err := validateEmail(source)
	if err != nil {
		return s.reject(actionForwarderCreate, params, err)
	}
	rawTargets := splitTargets(target)
	if len(rawTargets) == 0 {
		return s.reject(actionForwarderCreate, params, invalidEmail(target))
	}
	targets := make([]string, 0, len(rawTargets))
	for _, raw := range rawTargets {
		normalized, err := validateEmail(raw)
		if err != nil {
			return s.reject(actionForwarderCreate, params, err)
		}
		targets = append(targets, normalized)
	}
	normalizedTarget := strings.Join(targets, ", ")
	params["source"], params["target"] = normalizedSource, normalizedTarget
	if err := s.addForwarderFile(normalizedSource, normalizedTarget); err != nil {
		return s.reject(actionForwarderCreate, params, err)
	}
	if err := s.record(actionForwarderCreate, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

func (s *Service) addForwarderFile(source, target string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	domains, err := s.readDomains()
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read domains file: %v", err))
	}
	if !containsString(domains, domainOf(source)) {
		return apierr.NotFound("mail_domain_not_found", fmt.Sprintf("mail domain %q does not exist", domainOf(source)))
	}
	lines, err := readLines(s.cfg.MailAliasesFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read aliases file: %v", err))
	}
	for _, line := range lines {
		if existing, _, ok := parseAliasLine(line); ok && strings.EqualFold(existing, source) {
			return apierr.Conflict("forwarder_exists", fmt.Sprintf("forwarder %q already exists", source))
		}
	}
	lines = append(lines, source+" "+target)
	if err := writeFileAtomic(s.cfg.MailAliasesFile, joinLines(lines), 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write aliases file: %v", err))
	}
	return nil
}

// DeleteForwarder removes one alias entry.
func (s *Service) DeleteForwarder(source string) error {
	if s.cfg.DryRun {
		return dryRunErr()
	}
	normalized, err := validateEmail(source)
	if err != nil {
		return s.reject(actionForwarderDelete, map[string]any{"source": source}, err)
	}
	params := map[string]any{"source": normalized}
	if err := s.removeForwarderFile(normalized); err != nil {
		return s.reject(actionForwarderDelete, params, err)
	}
	if err := s.record(actionForwarderDelete, params); err != nil {
		return err
	}
	s.reload()
	return nil
}

func (s *Service) removeForwarderFile(source string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lines, err := readLines(s.cfg.MailAliasesFile)
	if err != nil {
		return apierr.Internal(fmt.Sprintf("read aliases file: %v", err))
	}
	found := false
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if existing, _, ok := parseAliasLine(line); ok && strings.EqualFold(existing, source) {
			found = true
			continue
		}
		kept = append(kept, line)
	}
	if !found {
		return apierr.NotFound("forwarder_not_found", fmt.Sprintf("forwarder %q does not exist", source))
	}
	if err := writeFileAtomic(s.cfg.MailAliasesFile, joinLines(kept), 0o600); err != nil {
		return apierr.Internal(fmt.Sprintf("write aliases file: %v", err))
	}
	return nil
}
