# CloudDeck

**A self-hosted web hosting control panel for Linux.** Sites, SSL, application runtimes, databases, mail, DNS, backups, files, and server security — from one clean web UI, without putting a root process behind a browser login.

[Website](https://clouddeck.dakshraman.in) · [Docs](docs/) · [API reference](docs/api.md) · [Deployment guide](docs/deployment.md) · [Roadmap](docs/roadmap.md)

![Version](https://img.shields.io/badge/version-0.6.9-1cc8e8?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Linux%20x86__64%20%7C%20arm64-1cc8e8?style=flat-square)
![Panel](https://img.shields.io/badge/panel-Next.js%2015-1cc8e8?style=flat-square)
![Agent](https://img.shields.io/badge/agent-Go%20stdlib-1cc8e8?style=flat-square)

---

## Why CloudDeck

- **One command on a fresh VPS.** The installer ships the agent, the panel, and a pinned Node runtime. On Debian/Ubuntu it also provisions nginx, PHP-FPM, MariaDB, certbot, and the Node toolchain.
- **The browser never reaches root.** The Next.js panel is unprivileged. A small Go agent is the only privileged process, bound to `127.0.0.1:9090` by default.
- **Typed operations, not shell strings.** Every system command runs through an explicit argument array. Callers cannot inject `sh -c`.
- **Everything is audited.** Mutations are appended to a JSONL audit log with timestamp, action, params, and outcome. Async tasks keep live logs.
- **cPanel-class surface, built original.** Domains, DNS, mail, files, FTP, databases, SSL, PHP, cron, terminal, apps, and security — no copied cPanel code or assets.

---

## Features

### Websites & SSL

- Create and delete sites with an nginx vhost and a confined webroot.
- Per-site PHP version switching, with a configurable FPM socket map for coexisting installs.
- Subdomains, redirects, disk usage, access-log statistics, and access/error log viewers.
- Per-site IP blocker with IPv4/IPv6 and CIDR support.
- Let's Encrypt certificates issued from the panel with certbot in webroot mode.
- Per-site WAF: real ModSecurity directives when the module is available, otherwise the built-in nginx rule engine.

### Application hosting

- First-class Node.js, Python, Go, Ruby, PHP, and custom app workloads.
- Runtime detection with version pickers.
- One supervised process per app, with automatic local port allocation starting from the runtime's default port.
- nginx reverse proxy in the site's vhost: a single app can own `/`, several apps are mounted at `/<name>/`.
- **systemd** supervision by default; **PM2** and **supervisord** selectable with `AGENT_APP_SUPERVISOR`.
- Per-app environment variables, start/stop/restart, auto-restart, and live logs.

### Databases

- MariaDB/MySQL databases, users, and grants from the panel.
- Generated passwords; the API never accepts raw SQL.
- Remote MySQL hosts cloned from an existing localhost user.
- phpMyAdmin detection and one-click authenticated login when it is installed.

### Mail

- Postfix + Dovecot management: mail domains, mailboxes, quotas, forwarders, and autoresponders.
- SHA-512 crypt passwd-file entries and maildirs.
- DKIM key management (RSA-2048) with one-click SPF, DMARC, and MX publishing into PowerDNS.
- **Caveat:** deliverability is still owned by the operator — IP reputation, reverse DNS, MX setup, and sending behavior. CloudDeck manages the software; it does not run an outbound relay.

### DNS

- PowerDNS-backed zones and records.
- A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA support.
- Mail authentication records can be published without leaving the panel.

### Backups

- Archive site files and databases, restore in place, and download archives.
- Off-site destinations through `rclone`: Google Drive, MEGA, Dropbox — plus Telegram uploads.
- Daily or weekly scheduled runs with per-source retention. Manual archives are never pruned.
- One-click restore for both sites and databases.

### Files, FTP & terminal

- Path-confined file manager: browse, edit, upload, download, rename, delete.
- chmod, copy, compress, and extract (`.tar.gz` / `.zip`); symlink escapes are rejected.
- pure-ftpd account management with per-site home directories.
- Web terminal backed by a real PTY, streamed to xterm.js over SSE.
- SSH authorized-keys management and keypair generation with fingerprints.

### Security

- Host firewall management for **ufw** or **firewalld**: allow/deny rules, tcp/udp, source CIDRs, enable/disable. CloudDeck only removes rules it created.
- **fail2ban** jails: visibility, enable/disable, and unban.
- **ModSecurity / OWASP CRS** detection and per-site WAF toggles.
- SSH hardening posture: port, root login, password auth, and pubkey auth, plus a host audit checklist.
- Session auth with bcrypt password hashes, HMAC-signed HttpOnly cookies, and a configurable secure-cookie policy.

### Monitoring & operations

- Dashboard CPU, RAM, disk, load, and uptime.
- Service probes for nginx, MariaDB/MySQL, and PHP-FPM, with restart actions.
- Top processes by CPU or memory.
- Async tasks with live logs for installs, SSL issuance, deletes, backups, and other mutations.
- Cron jobs across all sites, with a run-as user per job.

### Settings & CLI

- Account profile and contact email, password change, reduced-motion preference.
- Live server and agent details, session policy, sign-out, and a GitHub release checker.
- The installer adds a `clouddeck` CLI for status, service control, logs, password recovery, updates, reinstalls, and uninstall.

---

## How it fits together

```
Browser
   │  HTTP (same origin)
   ▼
Panel — Next.js, unprivileged
   │  HTTP + JSON over localhost
   ▼
Agent — Go, 127.0.0.1:9090, privileged
   │  exec with argument arrays, never a shell
   ▼
nginx · PHP-FPM · MariaDB · certbot · systemd · PowerDNS · Postfix/Dovecot
```

The panel is the only process the operator's browser talks to. It owns user accounts and sessions, and proxies typed requests to the agent. The agent is the only privileged process. It validates inputs, runs system commands with explicit argument arrays, writes JSONL audit entries, and persists state atomically.

---

## Requirements

| Component | Requirement |
|---|---|
| Host | Linux `x86_64` or `aarch64` |
| Recommended OS | Debian or Ubuntu (the installer provisions the full stack) |
| Panel | Node.js 20+; the installer ships Node 22 |
| Agent | Go 1.23+ only when building from source; release binaries are static |
| Web stack | nginx, PHP-FPM, MariaDB/MySQL, certbot — auto-installed on Debian/Ubuntu |
| Optional | PowerDNS, Postfix/Dovecot, pure-ftpd, fail2ban, ufw/firewalld, rclone, phpMyAdmin |
| Docker | Optional, for the self-contained demo/development stack |

The agent targets Linux. The panel can run on any OS for development, and the agent has a dry-run mode that works without root.

---

## Install

### Option 1 — one command (Linux, recommended)

```sh
curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash
```

On Debian/Ubuntu the installer:

- downloads the static agent binary and the self-contained panel bundle;
- installs a pinned Node 22 runtime under `/opt/clouddeck`;
- provisions nginx, PHP-FPM + common extensions, MariaDB server/client, certbot, git, and unzip with `apt-get`;
- creates `/www/wwwroot` and enables the web stack services;
- writes systemd units (`clouddeck-agent`, `clouddeck-panel`), or plain init scripts when systemd is unavailable;
- installs the `clouddeck` management CLI on `PATH`.

Default layout:

| Path | Contents |
|---|---|
| `/opt/clouddeck` | binaries, panel bundle, pinned Node runtime |
| `/var/lib/clouddeck` | sites, tasks, audit log, backups, panel users |
| `/etc/clouddeck` | `agent.env`, `panel.env`, generated secrets (mode 0600) |

The panel listens on `0.0.0.0:2083`; the agent listens on `127.0.0.1:9090`. Open `http://<server-ip>:2083` and create the admin account in the first-run setup wizard.

**Installer flags:**

| Flag | Purpose |
|---|---|
| `--version vX.Y.Z` | install a specific release |
| `--prefix DIR` | install directory (default `/opt/clouddeck`) |
| `--datadir DIR` | state directory (default `/var/lib/clouddeck`) |
| `--etcdir DIR` | config directory (default `/etc/clouddeck`) |
| `--panel-port N` | panel port (default `2083`) |
| `--agent-port N` | agent port (default `9090`) |
| `--no-panel` | install the agent only |
| `--no-agent` | install the panel only |
| `--no-systemd` | force plain init scripts |
| `--force` | re-download binaries even if the version matches |
| `--uninstall` | remove binaries and units, keep data/config |
| `--purge` | with `--uninstall`, remove data/config too |
| `--gh-token TOKEN` | GitHub token for a private repo |

```sh
# See all flags
curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash -s -- --help
```

> On non-Debian distros the panel and agent still install, but package provisioning is skipped with a warning. Install nginx, PHP-FPM, MariaDB, certbot, and the optional services manually. See [docs/deployment.md](docs/deployment.md).

### Option 2 — Docker

```sh
git clone https://github.com/dakshraman/clouddeck.git
cd clouddeck
docker compose up -d --build
```

Open <http://localhost:2083>. The stack includes:

| Service | Port | Purpose |
|---|---|---|
| `clouddeck-panel` | `2083` | panel UI |
| `clouddeck-server` | `9090` | agent API — development only |
| `clouddeck-server` | `8080` | sites served by the container's nginx |

Wait until `docker compose ps` reports `clouddeck-server` as `healthy` before logging in. The first build takes a few minutes. On Windows, use Docker Desktop with the WSL 2 backend and run the same command from PowerShell.

> The Docker stack is development/demo oriented. For a production host that serves real websites, use Option 1 or the manual topology in [docs/deployment.md](docs/deployment.md). Keep the agent off public interfaces.

### Option 3 — from source

Requirements: Node.js 20+ and Go 1.23+.

**Panel:**

```sh
cd panel
npm install
npm run dev          # http://localhost:2083
```

The dev panel expects an agent at `http://127.0.0.1:9090`.

**Agent in dry-run mode (no root, no system changes):**

```sh
cd agent
AGENT_DRY_RUN=true go run ./cmd/clouddeck-agent
```

Dry-run renders nginx configs into `agent/data/dryrun/` instead of touching the system — useful on macOS, Windows, and CI.

**Make targets:**

```sh
make up           # full Docker stack
make down         # stop it (volumes kept)
make logs         # follow container logs
make panel-dev    # Next.js dev server
make agent-dry    # dry-run agent
make typecheck    # panel TypeScript check
make test         # agent test suite
make fmt          # gofmt agent sources
```

**Windows helpers:**

```powershell
.\scripts\dev.ps1 panel       # panel dev server
.\scripts\dev.ps1 agent-dry   # agent dry-run
.\scripts\dev.ps1 typecheck   # panel typecheck
```

### First run

1. Open `http://<server-ip>:2083`.
2. Create the admin account in the setup wizard.
3. Add a site under **Sites → New site**.
4. Point the domain's DNS at the server.
5. Issue a certificate from the site's **Overview** tab.

For unattended provisioning, set both `PANEL_SEED_ADMIN` and `PANEL_SEED_PASSWORD` before first start; this creates the admin account and skips the wizard.

---

## Use CloudDeck

### Create a site

**Sites → New site.** Enter the domain and choose a PHP version or a static/application runtime. The agent creates the webroot, writes the nginx vhost, runs `nginx -t`, reloads nginx, and streams each step into the task log. A failure leaves the previous config intact.

### Issue SSL

Open the site → **Overview → Issue certificate**, enter the email address for the certificate authority, and run the task. certbot completes a webroot challenge. DNS must already point at the server, and port 80 must be reachable.

### Host an application

**Applications → New app** (or the **Applications** tab inside a site):

1. Pick a runtime and version (Node, Python, Go, Ruby, PHP, or custom).
2. Set the working directory, start command, and environment variables.
3. Optionally set a port and health-check path.
4. Deploy. CloudDeck allocates a free local port, writes the supervisor unit, starts the process, and adds the reverse proxy to the site's vhost.

Use the app card to start, stop, restart, or follow logs. Switching supervisors does not migrate existing apps; recreate them after changing `AGENT_APP_SUPERVISOR`.

### Manage databases

**Databases** → create a database or user, copy a generated password, and grant privileges. **Remote MySQL** clones an existing localhost user to an extra host. If phpMyAdmin is installed, the panel can detect it and hand over an authenticated session.

### Set up mail & DNS

**Mail** → add a mail domain, then mailboxes, quotas, forwarders, and autoresponders. Use the DKIM / email-DNS card to publish SPF, DMARC, DKIM, and MX records into the matching PowerDNS zone.

**DNS** → create zones and records directly. Supported record types: A, AAAA, CNAME, MX, TXT, NS, SRV, CAA.

> Mail deliverability depends on your IP reputation, rDNS, MX setup, and sending behavior. CloudDeck configures the software; it does not provide a relay or reputation service.

### Back up and restore

**Backups** → create a site or database archive, download it, or restore it in place. Configure a schedule (daily or weekly), retention count, and optional database inclusion. Off-site copies use `rclone` remotes (Google Drive, MEGA, Dropbox) or the Telegram Bot API.

### Manage files, FTP, and shell access

- **Files** → browse a site's webroot, edit text files, upload/download, rename, delete, chmod, copy, compress, or extract.
- **FTP** → create a pure-ftpd account scoped to a site and optional subdirectory.
- **Terminal** → open a PTY-backed shell in the browser (up to four sessions; idle sessions are closed after 15 minutes).
- **SSH** → add authorized keys or generate a keypair and download the private key once.

### Security

- **Security** → inspect ModSecurity/CRS, fail2ban jails, and SSH hardening.
- **Firewall** → add allow/deny rules, choose tcp/udp, restrict by source CIDR, and enable or disable the firewall.
- **Site → Security** → toggle the per-site WAF and block IPs or CIDR ranges.

### Everyday CLI

The installer puts `clouddeck` on `PATH`. Service control, user/password changes, updates, reinstalls, and uninstall require `sudo`.

```sh
clouddeck status                    # panel/agent state and versions
sudo clouddeck restart              # both services
sudo clouddeck restart panel        # or: restart agent
clouddeck logs panel -f             # follow logs (agent: logs agent)
sudo clouddeck user list
sudo clouddeck user add ops --email ops@example.com
sudo clouddeck user passwd          # reset a password; signs out sessions
sudo clouddeck update               # upgrade to the latest release
sudo clouddeck reinstall            # re-download the current version
sudo clouddeck uninstall --purge    # remove CloudDeck and all data
```

`clouddeck version` prints the installed version; `clouddeck help` lists every command.

### Update and uninstall

```sh
sudo clouddeck update               # latest release
sudo clouddeck update vX.Y.Z        # pin a version
sudo clouddeck reinstall            # refresh the current version
```

`clouddeck uninstall` stops and removes binaries and units but keeps data and config. Add `--purge` to remove those too. Distro packages installed by the one-command installer are left in place.

---

## Configuration

### Panel

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_URL` | `http://127.0.0.1:9090` | agent base URL |
| `PANEL_SESSION_SECRET` | dev default (warns) | HMAC key for session cookies; set a long random value in production |
| `PANEL_DATA_DIR` | `./data` | `users.json`, sessions, panel state |
| `PANEL_COOKIE_SECURE` | `true` when `NODE_ENV=production` | force the `Secure` cookie flag |
| `PANEL_SEED_ADMIN` | unset | create this admin on first start |
| `PANEL_SEED_PASSWORD` | unset | password for the seeded admin |

The installer writes `/etc/clouddeck/panel.env` with a generated session secret. It sets `PANEL_COOKIE_SECURE=false` initially; set it to `true` once the panel is behind HTTPS.

### Agent (selected variables)

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_LISTEN` | `127.0.0.1:9090` | keep this on localhost |
| `AGENT_STATE_DIR` | `./data` | sites, tasks, audit log, dry-run configs |
| `AGENT_NGINX_SITES_DIR` | `/etc/nginx/conf.d` | vhost output directory |
| `AGENT_WEBROOT` | `/www/wwwroot` | site document roots |
| `AGENT_PHP_FPM_SOCK` | `/run/php/php{{version}}-fpm.sock` | FPM socket template |
| `AGENT_PHP_SOCK_MAP` | empty | per-version socket map, e.g. `8.3=/tmp/php-cgi-83.sock` |
| `AGENT_MYSQL_ROOT_PASSWORD` | empty | passed via `MYSQL_PWD`; empty uses socket auth |
| `AGENT_DRY_RUN` | `false` | render configs without changing the host |
| `AGENT_APP_SUPERVISOR` | `systemd` | `systemd`, `pm2`, or `supervisor` |
| `AGENT_BACKUP_DIR` | `/var/lib/clouddeck/backups` | local archive directory |
| `AGENT_TELEGRAM_BOT_TOKEN` / `AGENT_TELEGRAM_CHAT_ID` | empty | enable Telegram backup uploads |

The full list — mail paths, FTP, terminal, SSH, firewall discovery, PowerDNS, rclone, and Docker-specific settings — is in [docs/api.md § Environment variables](docs/api.md#3-environment-variables).

---

## Development & testing

```sh
# Agent
cd agent
go test ./...
go vet ./...
gofmt -w .

# Panel
cd panel
npm run typecheck
npm run build
```

Smoke tests (run against a live deployment):

```sh
bash scripts/agent-smoke-test.sh http://127.0.0.1:9090
bash scripts/v02-agent-smoke-test.sh          # file manager + MySQL, real mode
powershell -ExecutionPolicy Bypass -File scripts/panel-smoke-test.ps1
```

CI runs the agent build/vet/test and the panel typecheck. See `.github/workflows/`.

> **Windows + WSL:** if the panel runs on Windows and the agent inside WSL 2, use `AGENT_URL=http://localhost:9090` — WSL's localhost relay may only bind IPv6. For a production build over plain HTTP, set `PANEL_COOKIE_SECURE=false`; the production cookie is `Secure` by default.

---

## Documentation

- [Website](https://clouddeck.dakshraman.in)
- [Architecture](docs/architecture.md) — components, request flow, security model
- [API reference](docs/api.md) — frozen agent and panel contracts
- [Deployment guide](docs/deployment.md) — one-line install, manual topologies, TLS, operations
- [Roadmap](docs/roadmap.md) — milestones, non-goals, cPanel parity map
- [cPanel parity](docs/cpanel-parity.md) — evidence-based feature map

---

## Status

Current version: **v0.6.9** — a dedicated Runtimes page with guarded uninstall, runtime switching from the Sites list, and boot hardening so the panel and hosted sites come back after a reboot.

- **v0.5.x** — sites + SSL, live task logs, dashboard, session auth, file manager, MySQL, service monitoring, PowerDNS, backups, mail, site operations, scheduled backups, FTP, web terminal, SSH keys, per-site WAF, remote MySQL, phpMyAdmin.
- **v0.6.0** — Node/Python/Go/Ruby/custom app hosting, supervisor backends, host firewall, Security page.
- **v0.6.1** — Settings: profile, password change, reduced motion, server/agent details, session policy, release checker.
- **v0.6.5** — one-command stack provisioning and the `clouddeck` CLI.
- **v0.6.6** — process kill button (SIGTERM → SIGKILL, audited), terminal full-page mode, CI/CD auto-publishing releases.
- **v0.6.7** — server reboot button from the panel (audited, dry-run protected).
- **v0.6.8** — SSH password change from the panel, one-click install of extra Node.js (20/22/24) and PHP (8.1–8.4) versions, Hostinger-style file manager (folder tree, multi-select bulk actions, search, drag-and-drop upload, grid view, move), services restart without configured commands, and nginx start-when-stopped fix on site create/delete.
- **v0.6.9** — separate Runtimes page listing installed Node.js/PHP versions with uninstall (refused while a site or app still uses the version), inline runtime switching from the Sites list, and boot hardening: `Restart=always` units where the panel pulls in the agent, plus the aaPanel port conflict that kept nginx/MariaDB from starting.

See [docs/roadmap.md](docs/roadmap.md) for what lands next.

## License

TBD.
