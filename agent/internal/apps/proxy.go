// App proxy listing and reconciliation.
package apps

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
	// Clean up any orphaned systemd units for apps that no longer exist in state
	if entries, err := os.ReadDir(s.cfg.AppUnitDir); err == nil {
		activeUnits := make(map[string]bool)
		for _, app := range s.st.ListApps() {
			activeUnits[unitName(specFromStore(app))+".service"] = true
		}
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "clouddeck-app-") && strings.HasSuffix(e.Name(), ".service") {
				if !activeUnits[e.Name()] {
					log("info", fmt.Sprintf("cleaning up orphaned app service %s", e.Name()))
					_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "stop", e.Name())
					_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "disable", e.Name())
					_ = os.Remove(filepath.Join(s.cfg.AppUnitDir, e.Name()))
					_ = safeexec.Run(ctx, s.cfg.DryRun, log, "systemctl", "daemon-reload")
				}
			}
		}
	}

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
