package systeminfo

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"clouddeck/agent/internal/apierr"
	"clouddeck/agent/internal/audit"
)

const (
	// actionReboot is the audit action recorded for host reboots.
	actionReboot = "system.reboot"
	// rebootDelay lets the HTTP response reach the operator before the
	// agent process dies with the machine.
	rebootDelay = 500 * time.Millisecond
)

// Reboot audits and then schedules the configured reboot command. The
// command runs in the background after a short delay so the 200 response
// is flushed first. Errors: 412 reboot_not_configured, 502 reboot_failed.
func Reboot(command string, auditLog *audit.Log) error {
	if auditLog == nil {
		return apierr.Internal("audit log is not configured")
	}
	argv := strings.Fields(strings.TrimSpace(command))
	if len(argv) == 0 {
		return apierr.New(412, "reboot_not_configured", "no reboot command is configured")
	}
	path, err := exec.LookPath(argv[0])
	if err != nil {
		return apierr.New(502, "reboot_failed",
			fmt.Sprintf("reboot command binary %q is not installed", argv[0]))
	}
	if err := auditLog.Append(audit.Record{
		Action: actionReboot,
		Params: map[string]any{"command": strings.Join(argv, " ")},
		Result: audit.ResultAccepted,
	}); err != nil {
		return apierr.Internal(fmt.Sprintf("write audit log: %v", err))
	}
	go func() {
		time.Sleep(rebootDelay)
		cmd := exec.Command(path, argv[1:]...)
		if err := cmd.Run(); err != nil {
			// The response is long gone; the operator reads the reason in
			// the agent log when the machine failed to go down.
			log.Printf("reboot command failed: %v", err)
		}
	}()
	return nil
}
