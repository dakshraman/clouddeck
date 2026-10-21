# CloudDeck roadmap

Versions are milestones, not dates.

## v0.2 — hosting essentials (shipped: v0.2.2)

- Sites: create / delete, per-site webroot, PHP version selection
- SSL: Let's Encrypt via certbot, per-site issuance
- Async tasks with live logs (UI polls while the task runs)
- System dashboard: CPU / RAM / disk
- Session auth for the panel
- Docker-based development environment
- File manager: browse, edit, upload, download, rename, delete inside site webroots — path-confined, symlink-rejecting, every mutation audited
- MySQL management: databases, users, grants, generated passwords (client binary driven with argument arrays only; API never accepts raw SQL)
- Configurable PHP-FPM socket template (`AGENT_PHP_FPM_SOCK`) for coexisting installs (e.g. an aaPanel-managed server)

## v0.3 — operations (shipped: v0.3.0)

- **System monitoring**: service status (nginx, MariaDB/MySQL, PHP-FPM) with per-service restart
- **DNS**: PowerDNS-backed zone and record management (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA)
- **Backup & restore**: archives of site files + databases with one-click restore; destinations:
  - local download (built-in),
  - Google Drive, MEGA, Dropbox (via `rclone`, typed argument arrays only),
  - Telegram (Bot API, configurable base URL so it can be tested against a local mock)

## v0.3.x — operations follow-ups (shipped: v0.4.0)

- Scheduled backups (daily/weekly) and retention — **shipped**: schedule card + agent scheduler with a per-source retention ledger (manual archives are never pruned)
- Cron jobs UI — **shipped**: per-site jobs written as `/etc/cron.d` fragments
- Subdomains and redirects per site — **shipped**
- Server logs viewer — **partial**: per-site access/error log viewer shipped; global nginx/PHP-FPM/audit viewers are backlog
- Multi-PHP management — **shipped**: `AGENT_PHP_SOCK_MAP` resolves each site's version to its FPM socket; per-site switching from the UI
- Load average + metric history charts — backlog

## v0.4 — mail + site operations (shipped: v0.4.0)

- Mail management, file-backed against the installed Postfix/Dovecot: domains, mailboxes (`{SHA256}` passwd-file entries, maildirs, quotas), forwarders (virtual-alias syntax), autoresponders (sieve vacation scripts)
- DKIM key management (RSA-2048) with one-click SPF/DMARC/MX publishing into the PowerDNS zone
- Site operations: subdomains (task-backed, own vhost blocks), redirects, cron jobs, per-site PHP switching, per-site IP blocker, disk usage, access-log statistics, log viewer
- Scheduled backups: daily/weekly runs with per-source retention
- Honest caveats: deliverability depends on IP reputation, rDNS and MX setup — CloudDeck configures the software, the operator owns the reputation. No outbound relay service.
- Not in v0.4 (backlog): webmail frontend, SpamAssassin integration, FTP accounts, one-click WordPress

## v0.5 — toolbox + design system (features shipped: v0.5.0, webroot-ownership fix: v0.5.1, UI pass: v0.5.2)

The cPanel toolbox wave, per the requested feature list:

- **FTP accounts** — pure-ftpd passwd file (SHA-512 crypt), per-site paths, reload via `pure-pw mkdb`
- **phpMyAdmin access** — detects the installed instance (aaPanel layout) and links from the panel
- **Cron Jobs** — dedicated page across all sites + run-as user (root/www) per job
- **Terminal** — web terminal (stdlib PTY, SSE streaming to xterm.js in the panel)
- **SSH** — authorized_keys management + keypair generation with fingerprints
- **Remote DB** — clone a MySQL user's credentials + grants to an extra host
- **IP Blocker** — CIDR range support
- **ModSecurity / WAF** — per-site toggle; real `modsecurity` directives when the module exists, otherwise the CloudDeck nginx-rule engine (sensitive files + injection patterns)
- **File manager completion** — chmod, copy, compress/extract (tar.gz/zip)

**Panel UI/UX decision**: adopt **shadcn/ui** as the component foundation and
**Animate UI** for motion (motion/react). Tailwind v3 classic setup with CSS
variables; theme tokens tuned to the existing slate-dark look so it is an
upgrade, not a reskin. Motion is curated (animated icons, counters, dialog/tab
transitions) — ops flows stay instant. Delivered as the **cPanel-style UI pass
(v0.5.2)** on top of the v0.5.0 feature release.

## v0.6 — app runtimes, firewall + security (shipped: v0.6.0)

- **Application runtimes** — detects Node.js, Python, Go, Ruby, PHP and custom; version pickers in New Site; static sites unchanged
- **App workloads** — one supervised process per app, automatic local port allocation, per-app env vars, auto-restart, live logs, start/stop/restart; a single app owns `/`, several apps are proxied under `/<name>/`
- **Supervision backends** — systemd (default), PM2 and supervisord, selected with `AGENT_APP_SUPERVISOR`
- **Firewall** — ufw/firewalld rule management (allow/deny, tcp/udp, source CIDR), enable/disable, state + audit trail
- **Security surface** — ModSecurity + OWASP CRS detection, fail2ban jails (enable/disable, unban), SSH hardening posture and a host audit checklist
- Honest caveats: ModSecurity is *detected and surfaced*, not compiled into a third-party nginx; on hosts without the module the per-site nginx-rule WAF (v0.5) remains the enforcement path.
- Deferred: per-app custom domains, zero-downtime deploys, one-click app installers

## v0.7 — multi-server / SaaS

- Central panel managing many servers: one agent per server, mutual TLS, job queue
- White-label branding
- Billing via Stripe (subscriptions per managed server)

This is the RunCloud/Ploi SaaS model: bring your own server, manage it from a
hosted panel.

## cPanel-class parity map

The long-term bar is "cPanel-class": everything a shared-hosting operator expects,
built original — no copied cPanel code or assets. A working map, not a promise.
Detailed, evidence-based map: [docs/cpanel-parity.md](cpanel-parity.md) — learned
from the public cPanel installer's layer-1 scripts.

| Area | cPanel has | CloudDeck |
|---|---|---|
| Domains | addon/subdomains, redirects, parked | subdomains + redirects in v0.3.x |
| DNS | zones, records, DNSSEC | zones + records shipped (v0.3); DNSSEC later |
| Email | mailboxes, forwarders, autoresponders, spam, webmail, DKIM/SPF/DMARC | v0.4: Postfix + Dovecot + OpenDKIM management, DNS helpers |
| Files | file manager, disk quotas | file manager (v0.2) + chmod/copy/compress/extract (v0.5); quotas later |
| FTP | per-site FTP accounts | v0.5: pure-ftpd account management |
| Databases | MySQL, phpMyAdmin, remote access | MySQL (v0.2); phpMyAdmin access + remote hosts (v0.5) |
| SSL | AutoSSL, per-domain certs | per-site Let's Encrypt shipped (v0.2) |
| PHP | multi-version, per-directory handler | multi-PHP switching in v0.3.x |
| Cron | cron jobs UI | v0.5: dedicated Cron Jobs page, run-as root/www |
| Shell | Terminal, SSH access | v0.5: web terminal + SSH key manager |
| Apps | Softaculous one-click installers | v0.6: Node/Python/Go/Ruby/custom app hosting with systemd/PM2/supervisor; one-click WordPress backlog |
| Stats | bandwidth, resource usage, visitors | host metrics shipped (v0.3); per-site bandwidth later |
| Security | IP blocker, hotlink protection, WAF-lite | v0.5: per-site WAF + IP blocker with CIDR; v0.6: firewall manager, ModSecurity/CRS + fail2ban visibility, SSH posture |
| Accounts | WHM / resellers, packages, quotas | v0.5 multi-server layer first; reseller model evaluated after |

## v1.0 — productization

- Unattended installer: one command, fully scripted, idempotent
- Migration tool importing sites, databases and certificates from cPanel / aaPanel

## Non-goals (v1)

- **Hosted email reputation** — we manage mail *software* (v0.4); we do not run a relay or deliverability service.
- **Windows servers** — the agent targets Linux (systemd, nginx, certbot) exclusively.
- **Kubernetes-style orchestration** — CloudDeck manages one to a few VPSes, not a cluster.
