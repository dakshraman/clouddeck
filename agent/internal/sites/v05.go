// v0.5 additions to the sites service: per-site WAF state and the aggregate
// cron view used by the panel's Cron Jobs page. See docs/api.md section 1.9.
package sites

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
	"clouddeck/agent/internal/config"
	"clouddeck/agent/internal/store"
)

// WAF engines reported in WAFInfo.Engine.
const (
	WAFEngineNginxRules  = "nginx-rules"
	WAFEngineModSecurity = "modsecurity"
)

// WAF notes returned in WAFInfo.Note, one per engine.
const (
	wafNoteModSecurity = "ModSecurity module detected: per-site modsecurity directives are applied."
	wafNoteNginxRules  = "This server's nginx has no ModSecurity module — CloudDeck WAF rules (sensitive-file and injection-pattern blocking) are applied instead."
)

// WAFInfo describes a site's WAF state plus which engine this server runs.
type WAFInfo struct {
	Enabled bool   `json:"enabled"`
	Engine  string `json:"engine"`
	Note    string `json:"note,omitempty"`
}

// detectWAFEngine reports which per-site WAF flavor this server runs by
// looking for the modsecurity module in `<NginxBin> -V` output. Detection
// happens on every call (no cache); a missing binary or a failed exec falls
// back to the plain nginx-rules engine.
func detectWAFEngine(cfg config.Config) string {
	bin := cfg.NginxBin
	if bin == "" {
		bin = "nginx"
	}
	out, err := exec.Command(bin, "-V").CombinedOutput()
	if err != nil {
		return WAFEngineNginxRules
	}
	if strings.Contains(strings.ToLower(string(out)), "modsecurity") {
		return WAFEngineModSecurity
	}
	return WAFEngineNginxRules
}

// wafInfo assembles the reply shared by GetWAF and SetWAF.
func wafInfo(enabled bool, engine string) WAFInfo {
	note := wafNoteNginxRules
	if engine == WAFEngineModSecurity {
		note = wafNoteModSecurity
	}
	return WAFInfo{Enabled: enabled, Engine: engine, Note: note}
}

// GetWAF reports a site's WAF state and the detected engine.
func (s *Service) GetWAF(domain string) (WAFInfo, error) {
	site, err := s.Get(domain)
	if err != nil {
		return WAFInfo{}, err
	}
	return wafInfo(site.WAFEnabled, detectWAFEngine(s.cfg)), nil
}

// ensureModsecConf writes a minimal rules file for the ModSecurity engine when
// none exists yet. An existing file is never overwritten.
func ensureModsecConf(path string) error {
	if path == "" {
		return errors.New("modsecurity rules file path is not configured")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create modsecurity dir: %w", err)
	}
	content := "# managed-by: clouddeck\n" +
		"SecRuleEngine On\n" +
		"SecRule REQUEST_URI \"@rx (\\.env|\\.git/|\\.htaccess)\" \"id:9000001,phase:1,deny,status:403,log,msg:'CloudDeck WAF demo rule'\"\n"
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("create modsecurity rules file: %w", err)
	}
	if _, err := f.WriteString(content); err != nil {
		f.Close()
		os.Remove(path)
		return fmt.Errorf("write modsecurity rules file: %w", err)
	}
	return f.Close()
}

// SetWAF toggles the site's WAF, re-renders the vhost and audits the change.
// Setting the flag it already has is a no-op and does not re-render; on a
// failed render both the persisted flag and the config are rolled back.
func (s *Service) SetWAF(domain string, enabled bool) (WAFInfo, error) {
	if s.cfg.DryRun {
		return WAFInfo{}, s.dryRunErr()
	}
	site, err := s.Get(domain)
	if err != nil {
		return WAFInfo{}, err
	}
	engine := detectWAFEngine(s.cfg)
	if site.WAFEnabled == enabled {
		return wafInfo(enabled, engine), nil
	}
	if enabled && engine == WAFEngineModSecurity {
		if err := ensureModsecConf(s.cfg.ModsecConf); err != nil {
			return WAFInfo{}, apierr.Internal(fmt.Sprintf("prepare modsecurity rules: %v", err))
		}
	}
	params := map[string]any{"domain": site.Domain, "enabled": enabled}
	if err := s.audit.Append(audit.Record{Action: ActionWAFSet, Params: params, Result: audit.ResultAccepted}); err != nil {
		return WAFInfo{}, apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}

	previous := site.WAFEnabled
	if err := s.st.UpdateSite(site.Domain, func(current *store.Site) {
		current.WAFEnabled = enabled
		current.UpdatedAt = store.Now()
	}); err != nil {
		return WAFInfo{}, apierr.Internal(fmt.Sprintf("persist WAF flag: %v", err))
	}
	updated, ok := s.st.GetSite(site.Domain)
	if !ok {
		return WAFInfo{}, apierr.Internal(fmt.Sprintf("site %s vanished from state", site.Domain))
	}
	if err := s.ApplyNginx(context.Background(), logToStd, updated); err != nil {
		return WAFInfo{}, s.renderFailure(context.Background(), site.Domain, func(current *store.Site) { current.WAFEnabled = previous }, err)
	}
	return wafInfo(updated.WAFEnabled, engine), nil
}

// SiteCron groups one site's cron jobs for the aggregate view.
type SiteCron struct {
	Domain string          `json:"domain"`
	Jobs   []store.CronJob `json:"jobs"`
}

// AllCron returns every site's cron jobs, sites sorted by domain.
func (s *Service) AllCron() []SiteCron {
	list := s.st.ListSites()
	out := make([]SiteCron, 0, len(list))
	for _, site := range list {
		out = append(out, SiteCron{Domain: site.Domain, Jobs: nonNil(site.Cron)})
	}
	return out
}
