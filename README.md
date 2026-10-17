# CloudDeck

Self-hosted web hosting control panel — a modern, secure take on cPanel / aaPanel.

> Working name. Renaming is a simple search & replace of `clouddeck` / `CloudDeck`.

## What it is

CloudDeck lets you manage websites, SSL certificates, and server services from a clean web UI:

- **`panel/`** — web UI + API (Next.js + TypeScript). Runs **unprivileged**.
- **`agent/`** — privileged worker (Go, single static binary). Performs all system operations through a typed, allow-listed API.

**Security principle:** the HTTP-facing web app never runs as root. Only the small Go agent has privileges, it executes typed commands (no shell string interpolation), and it writes an audit log for every action.

## Quickstart (one command, any Linux server)

```sh
curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash
```

Installs the agent (static binary) and panel (self-contained bundle, no distro packages needed: everything is fetched with `curl` and unpacked with `tar`). Works on x86_64 and aarch64, with systemd or plain init fallback. Ends by printing the panel URL; the admin account is created in the browser on first visit (first-run setup wizard).

- Flags: `--version vX.Y.Z`, `--prefix`, `--panel-port`, `--agent-port`, `--no-panel`, `--no-agent`, `--uninstall`, `--purge` → `curl ... | sudo bash -s -- --help`
- Private repo: add `-H "Authorization: token <gh-token>"` to the curl and pass `--gh-token <gh-token>` to the installer.

## Quickstart (Docker)

```bash
docker compose up -d --build
```

Then open http://localhost:3000 — the first visit creates your admin account in the setup wizard.

This starts:

- `clouddeck-server` — an Ubuntu container running nginx + the agent (http://localhost:9090/v1/health)
- `clouddeck-panel` — the panel UI (http://localhost:3000)

Sites created in the panel are served by the container's nginx on http://localhost:8080. The first build takes a few minutes; wait until `docker compose ps` reports `clouddeck-server` as `healthy` before logging in.

On Windows: install Docker Desktop (WSL 2 backend) and run the same command from PowerShell in the repo root.

## Local development

Requirements: Node 20+ (panel), Go 1.23+ (agent), Docker optional.

**Panel (any OS):**

```bash
cd panel
npm install
npm run dev          # http://localhost:3000, expects an agent on 127.0.0.1:9090
```

**Agent without root/nginx (dry-run — safe on any OS):**

```bash
cd agent
AGENT_DRY_RUN=true go run ./cmd/clouddeck-agent
```

Dry-run renders nginx configs into `agent/data/dryrun/` instead of touching the system.

**Windows helpers (PowerShell):**

```powershell
.\scripts\dev.ps1 panel       # panel dev server
.\scripts\dev.ps1 agent-dry   # agent in dry-run mode (Go 1.23+ required)
.\scripts\dev.ps1 typecheck   # panel typecheck
```

Equivalent for agent dry-run in PowerShell: `$env:AGENT_DRY_RUN="true"; go run ./cmd/clouddeck-agent`.

**Make targets (Linux / macOS / Git Bash):** `make up`, `make down`, `make logs`, `make build`, `make agent`, `make agent-dry`, `make panel-dev`, `make typecheck`, `make test`, `make fmt`, `make clean`.

## Testing

Two smoke tests exercise the full stack against a running deployment:

```bash
bash scripts/agent-smoke-test.sh http://127.0.0.1:9090   # agent API: validation, create/poll/delete, dry-run friendly
bash scripts/v02-agent-smoke-test.sh                      # file manager + MySQL (real mode; creates and removes its own test site + database)
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/panel-smoke-test.ps1   # end-to-end: login, session auth, agent proxy, site lifecycle
```

**Windows + WSL note:** when the panel runs on Windows and the agent runs inside WSL 2, WSL's localhost relay only binds IPv6 — start the panel with `AGENT_URL=http://localhost:9090` (`127.0.0.1` will not reach the agent). If you run the production build over plain HTTP, also set `PANEL_COOKIE_SECURE=false`; the session cookie is `Secure` by default in production and strict HTTP clients refuse to send it over `http://` (browsers make an exception for localhost).

## Repository layout

```
agent/      Go agent: HTTP/JSON API on 127.0.0.1:9090, async tasks, audit log
panel/      Next.js panel: UI + API routes, session auth, agent proxy
docs/       architecture.md, api.md, deployment.md, roadmap.md
scripts/    install-agent.sh (VPS installer), dev.ps1 (Windows helpers), agent-smoke-test.sh + v02-agent-smoke-test.sh + panel-smoke-test.ps1 (smoke tests)
.github/    CI workflow (agent build/vet/test, panel typecheck)
docker-compose.yml  dev stack: agent + nginx container, panel
Makefile            developer entry points
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — components, principles, security model
- [docs/api.md](docs/api.md) — frozen API contracts (agent + panel)
- [docs/deployment.md](docs/deployment.md) — full VPS deployment guide
- [docs/roadmap.md](docs/roadmap.md) — versions and non-goals

## Status

Current release (`v0.4.0`): **one-command installer** (`curl … | sudo bash`, any Linux distro, installs the latest stable release) with a **first-run setup wizard** (admin account created in the browser), sites (create/delete), SSL via certbot, live task logs, system dashboard, session auth, Docker dev environment, **file manager** (browse/edit/upload/download — path-confined, symlink-rejecting, audited), **MySQL management** (databases, users, grants, generated passwords), v0.3 **operations**: **service monitoring + restarts**, **DNS zone/record management** (PowerDNS), **backup & restore** (site + database archives; local download, Telegram and rclone destinations) — and v0.4: **mail management** (domains, mailboxes with quotas, forwarders, autoresponders, DKIM keys with one-click SPF/DMARC/MX publishing — file-backed against your installed MTA/Dovecot), **site operations** (subdomains, redirects, cron jobs, per-site PHP switching, IP blocker, disk usage, traffic stats and log viewer — in cPanel-style site tabs), and **scheduled backups** (daily/weekly with retention). See [docs/roadmap.md](docs/roadmap.md) for what lands next.

License: TBD.
