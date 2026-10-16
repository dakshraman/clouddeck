# CloudDeck architecture

## Components

```
┌─────────────────┐  HTTP (same-origin)  ┌──────────────────────────────┐
│  Browser        │─────────────────────▶│  Panel (Next.js, unprivileged)│
│  (operator)     │◀─────────────────────│  UI + /api routes + session   │
└─────────────────┘                      └──────────────┬───────────────┘
                                                        │ HTTP+JSON (localhost)
                                                        ▼
                                         ┌──────────────────────────────┐
                                         │  Agent (Go, root)             │
                                         │  127.0.0.1:9090, typed API    │
                                         │  async tasks + audit log      │
                                         └──────────────┬───────────────┘
                                                        │ exec (arg arrays, no shell)
                        ┌───────────────┬───────────────┼───────────────┬──────────────┐
                        ▼               ▼               ▼               ▼              ▼
                     nginx          PHP-FPM        certbot        systemd       filesystem
```

- The **panel** is the only process the operator's browser talks to. It holds no system privileges and owns user accounts (bcrypt hashes) and sessions (signed cookies).
- The **agent** is the only privileged process. It exposes a small, typed HTTP/JSON API on localhost: site lifecycle, SSL issuance, system metrics, tasks.
- The agent never accepts shell strings from callers. Every external command is executed with an explicit argument array; all inputs are validated first.

## Design principles

1. **Least privilege.** The web-facing app runs unprivileged. Privileged code lives in a single small binary with a narrow API.
2. **Typed commands, no shell.** `exec.CommandContext("nginx", "-t")` — never `sh -c "<string>"`.
3. **Async tasks.** Mutations (create/delete site, issue SSL) return `202 {taskId}` and run in the background. The UI polls for logs. Installs/renames in nginx can take seconds; nobody waits on a synchronous HTTP request.
4. **Audit everything.** Every mutation is appended as JSONL to `audit.log` with timestamp, action, params, outcome.
5. **Dry-run mode.** `AGENT_DRY_RUN=true` makes the agent fully exercisable on any OS without root: no system changes, rendered nginx configs written to `data/dryrun/` for inspection. This is how we develop on Windows.
6. **State + reconcile.** The agent persists sites in `state.json` and can reconcile against reality (a site whose nginx config disappeared is marked `error`). State files are written atomically (temp file + rename).

## Request flow — "Create site"

1. Browser → `POST /api/sites {domain, phpVersion}` (session cookie required).
2. Panel validates input, forwards to agent `POST /v1/sites`.
3. Agent validates (strict domain regex, duplicate check), persists the site as `provisioning`, returns `202 {taskId}`.
4. Task runs: create webroot → render nginx config → `nginx -t` → reload nginx → mark site `active`. Each step appends a log line.
5. Browser polls `GET /api/tasks/{id}` every second and renders the live log; a failure surfaces the error message.

## Security model

| Threat | Mitigation |
|---|---|
| RCE through the web UI | Panel is unprivileged; agent API accepts typed params, never shell strings |
| Agent exposed to the internet | Binds `127.0.0.1` by default; deployment guide keeps it off public interfaces |
| Session theft | HttpOnly + SameSite=Lax cookie; `Secure` in production; HMAC-signed |
| Path traversal | Domains validated by regex; filesystem paths are derived from the validated domain only |
| Silent damage | JSONL audit log + per-task logs for every mutation |
| Supply chain | No third-party Go dependencies in the agent (stdlib only) |

Future (v0.5, multi-server): mutual TLS between panel and agents, agent tokens, role separation (admin/reseller/client).

## Storage

| Location | Content |
|---|---|
| `agent/data/state.json` | Sites (domain, root, phpVersion, ssl, status, timestamps) |
| `agent/data/tasks.json` | Last 200 tasks incl. logs |
| `agent/data/audit.log` | JSONL audit trail |
| `agent/data/dryrun/` | Rendered nginx configs in dry-run mode |
| `panel/data/users.json` | Panel users (bcrypt hashes) |

## Deployment topologies

- **v0.1 (current):** single server — panel + agent + nginx on one machine. Panel behind TLS (Caddy/nginx), agent on localhost only.
- **v0.5:** split — panel on its own host, managing many servers, one agent per server, mutual TLS.
- **v1.0:** SaaS — the RunCloud/Ploi model (bring your own server) with billing and white-label.

## Non-goals for v0.1

Email hosting (deliverability and abuse are a support nightmare), DNS UI, file manager, billing, multi-server. See `docs/roadmap.md`.
