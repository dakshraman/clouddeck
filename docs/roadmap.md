# CloudDeck roadmap

Versions are milestones, not dates.

## v0.2 — hosting essentials (current)

- Sites: create / delete, per-site webroot, PHP version selection
- SSL: Let's Encrypt via certbot, per-site issuance
- Async tasks with live logs (UI polls while the task runs)
- System dashboard: CPU / RAM / disk
- Session auth for the panel
- Docker-based development environment
- File manager: browse, edit, upload, download, rename, delete inside site webroots — path-confined, symlink-rejecting, every mutation audited
- MySQL management: databases, users, grants, generated passwords (client binary driven with argument arrays only; API never accepts raw SQL)
- Configurable PHP-FPM socket template (`AGENT_PHP_FPM_SOCK`) for coexisting installs (e.g. an aaPanel-managed server)

## v0.3 — operations (next)

- **System monitoring**: service status (nginx, MariaDB/MySQL, PHP-FPM), load average, per-service restart, metric history charts
- **DNS**: PowerDNS-backed zone and record management (A, AAAA, CNAME, MX, TXT, NS, SRV)
- **Backup & restore**: archives of site files + databases; destinations:
  - local download (built-in),
  - Google Drive, MEGA, Dropbox (via `rclone`, typed argument arrays only),
  - Telegram (Bot API, configurable base URL so it can be tested against a local mock)
  - scheduled backups (daily/weekly) and one-click restore
- Cron jobs UI (per site and per user)
- Server logs viewer: nginx, PHP-FPM and agent audit log
- Multi-PHP management: several PHP versions installed and switchable per site

## v0.4 — mail

- Virtual mailbox management: Postfix + Dovecot — domains, mailboxes, aliases, forwarders
- DKIM signing; SPF/DMARC record helpers in the DNS zone editor
- Honest caveats: deliverability depends on IP reputation, rDNS and MX setup — CloudDeck configures the software, the operator owns the reputation. No outbound relay service.

## v0.5 — multi-server / SaaS

- Central panel managing many servers: one agent per server, mutual TLS, job queue
- White-label branding
- Billing via Stripe (subscriptions per managed server)

This is the RunCloud/Ploi SaaS model: bring your own server, manage it from a
hosted panel.

## v1.0 — productization

- Unattended installer: one command, fully scripted, idempotent
- Migration tool importing sites, databases and certificates from cPanel / aaPanel

## Non-goals (v1)

- **Hosted email reputation** — we manage mail *software* (v0.4); we do not run a relay or deliverability service.
- **Windows servers** — the agent targets Linux (systemd, nginx, certbot) exclusively.
- **Kubernetes-style orchestration** — CloudDeck manages one to a few VPSes, not a cluster.
