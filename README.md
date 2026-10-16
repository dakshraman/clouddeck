# CloudDeck

Self-hosted web hosting control panel — a modern, secure take on cPanel / aaPanel.

> Working name. Renaming is a simple search & replace of `clouddeck` / `CloudDeck`.

## What it is

CloudDeck lets you manage websites, SSL certificates, and server services from a clean web UI:

- **`panel/`** — web UI + API (Next.js + TypeScript). Runs **unprivileged**.
- **`agent/`** — privileged worker (Go, single static binary). Performs all system operations through a typed, allow-listed API.

**Security principle:** the HTTP-facing web app never runs as root. Only the small Go agent has privileges, it executes typed commands (no shell string interpolation), and it writes an audit log for every action.

## Quickstart (Docker)

```bash
docker compose up --build
```

Then open http://localhost:3000 and log in with `admin` / `admin` (change the seed password via `PANEL_SEED_PASSWORD` before any real use).

This starts:
- `clouddeck-server` — an Ubuntu container running nginx + the agent (http://localhost:9090/v1/health)
- `clouddeck-panel` — the panel UI (http://localhost:3000)

## Local development

Requirements: Node 20+, Go 1.23+ (for the agent), optionally Docker.

- Panel only: `cd panel && npm install && npm run dev` (expects an agent on `127.0.0.1:9090`)
- Agent without root/nginx (dry-run, safe on any OS): `cd agent && AGENT_DRY_RUN=true go run ./cmd/clouddeck-agent`
  Dry-run renders nginx configs into `agent/data/dryrun/` instead of touching the system.
- Windows helpers: `scripts/dev.ps1 typecheck | panel | agent-dry`

## Repository layout

```
agent/    Go agent: HTTP/JSON API on 127.0.0.1:9090, async tasks, audit log
panel/    Next.js panel: UI + API routes, session auth, agent proxy
docs/     architecture.md, api.md, deployment.md, roadmap.md
scripts/  install-agent.sh (VPS installer), dev.ps1 (Windows helpers)
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — components, principles, security model
- [docs/api.md](docs/api.md) — frozen API contracts (agent + panel)
- [docs/deployment.md](docs/deployment.md) — full VPS deployment guide
- [docs/roadmap.md](docs/roadmap.md) — versions and non-goals

## Status

Early MVP (`v0.1.0`): sites (create/delete), SSL via certbot, live task logs, system dashboard.

License: TBD.
