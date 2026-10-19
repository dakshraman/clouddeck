// App proxy listing and reconciliation.
package apps

import (
	"context"
	"fmt"

	"clouddeck/agent/internal/safeexec"
	"clouddeck/agent/internal/store"
)

// ProxyFor returns the apps of one site as store records, for nginx rendering.
// It satisfies sites.AppLister.
func (s *Service) ProxyFor(site string) []store.App {
	out := make([]store.App, 0, 4)
	for _, app := range s.st.ListApps() {
		if app.Site == site {
			out = append(out, app)
		}
	}
	return out
}

// ReconcileApps re-applies proxy config for every site that has apps. It runs
// at startup so nginx matches state after a crash or manual config edit.
func (s *Service) ReconcileApps(ctx context.Context, log safeexec.Logger, apply func(ctx context.Context, log safeexec.Logger, domain string) error) {
	seen := map[string]bool{}
	for _, app := range s.st.ListApps() {
		if seen[app.Site] {
			continue
		}
		seen[app.Site] = true
		if err := apply(ctx, log, app.Site); err != nil {
			log("warn", fmt.Sprintf("reconcile nginx for %s: %v", app.Site, err))
		}
	}
}
