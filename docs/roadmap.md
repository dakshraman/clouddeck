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

## v0.5 — multi-server / SaaS

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
| Files | file manager, disk quotas | file manager shipped (v0.2); quotas later |
| FTP | per-site FTP accounts | v0.3.x: FTP account management |
| Databases | MySQL, phpMyAdmin, remote access | MySQL shipped (v0.2) |
| SSL | AutoSSL, per-domain certs | per-site Let's Encrypt shipped (v0.2) |
| PHP | multi-version, per-directory handler | multi-PHP switching in v0.3.x |
| Cron | cron jobs UI | v0.3.x |
| Apps | Softaculous one-click installers | v0.4+: curated installer (WordPress via wp-cli) |
| Stats | bandwidth, resource usage, visitors | host metrics shipped (v0.3); per-site bandwidth later |
| Security | IP blocker, hotlink protection, WAF-lite | planned post-v0.4 |
| Accounts | WHM / resellers, packages, quotas | v0.5 multi-server layer first; reseller model evaluated after |

## v1.0 — productization

- Unattended installer: one command, fully scripted, idempotent
- Migration tool importing sites, databases and certificates from cPanel / aaPanel

## Non-goals (v1)

- **Hosted email reputation** — we manage mail *software* (v0.4); we do not run a relay or deliverability service.
- **Windows servers** — the agent targets Linux (systemd, nginx, certbot) exclusively.
- **Kubernetes-style orchestration** — CloudDeck manages one to a few VPSes, not a cluster.
