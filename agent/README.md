# clouddeck-agent

The privileged CloudDeck agent. One small Go binary (standard library only) that
manages nginx sites, Let's Encrypt certificates, PHP version discovery and host
metrics behind a typed HTTP/JSON API on `127.0.0.1:9090`. The panel is the only
client; the browser never talks to the agent.

The API contract is frozen in [`../../docs/api.md`](../../docs/api.md) (section 1).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_LISTEN` | `127.0.0.1:9090` | HTTP listen address (keep it on localhost) |
| `AGENT_STATE_DIR` | `./data` | `state.json`, `tasks.json`, `audit.log`, dry-run configs |
| `AGENT_NGINX_SITES_DIR` | `/etc/nginx/conf.d` | Where site vhosts are written |
| `AGENT_WEBROOT` | `/www/wwwroot` | Parent dir for site document roots |
| `AGENT_PHP_BASE` | `/etc/php` | Scanned for `8.x` version dirs |
| `AGENT_LOG_DIR` | `/var/log/nginx` | Directory site access/error logs point at (created if missing) |
| `AGENT_DRY_RUN` | `false` | No system changes; configs go to `<state>/dryrun/` |

## Build and run

```sh
go build ./cmd/clouddeck-agent
./clouddeck-agent
```

Dry-run (works on Windows/macOS without root and without nginx):

```sh
AGENT_DRY_RUN=true ./clouddeck-agent
curl -s http://127.0.0.1:9090/v1/health
curl -s -X POST http://127.0.0.1:9090/v1/sites \
  -d '{"domain":"example.com","phpVersion":"8.3"}' -H 'Content-Type: application/json'
# rendered config appears in ./data/dryrun/example.com.conf
```

Tests: `go test ./...`

## Security notes

- **Localhost only.** Default bind is `127.0.0.1`; there is no auth in v0.1, so
  never expose the port publicly.
- **No shell, ever.** Commands run via `exec.CommandContext` with explicit
  argument arrays (`internal/safeexec`); callers can never inject shell strings.
- **Validated input.** Domains must match the frozen regex; filesystem paths are
  derived from the validated domain only. PHP versions are checked against the
  offered list.
- **Audit trail.** Every mutation decision (accepted or rejected) is appended as
  a JSON line to `<AGENT_STATE_DIR>/audit.log`.
- **No third-party dependencies.** Standard library only.
- Runs as root on Linux by design (nginx reloads, `/etc` writes); the dry-run
  mode exists so development never needs privileges.
