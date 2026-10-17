// v0.5 additions to the sites service: per-site WAF state and the aggregate
// cron view used by the panel's Cron Jobs page. See docs/api.md section 1.9.
package sites

import (
	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/store"
)

// WAF engines reported in WAFInfo.Engine.
const (
	WAFEngineNginxRules  = "nginx-rules"
	WAFEngineModSecurity = "modsecurity"
)

// WAFInfo describes a site's WAF state plus which engine this server runs.
type WAFInfo struct {
	Enabled bool   `json:"enabled"`
	Engine  string `json:"engine"`
	Note    string `json:"note,omitempty"`
}

// GetWAF reports a site's WAF state and the detected engine.
func (s *Service) GetWAF(domain string) (WAFInfo, error) {
	return WAFInfo{}, apierr.Internal("waf: not implemented")
}

// SetWAF toggles the site's WAF and re-renders nginx.
func (s *Service) SetWAF(domain string, enabled bool) (WAFInfo, error) {
	return WAFInfo{}, apierr.Internal("waf: not implemented")
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
