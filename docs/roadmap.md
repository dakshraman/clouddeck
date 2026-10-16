# CloudDeck roadmap

Versions are milestones, not dates.

## v0.1 — single-server MVP (current)

- Sites: create / delete, per-site webroot, PHP version selection
- SSL: Let's Encrypt via certbot, per-site issuance
- Async tasks with live logs (UI polls while the task runs)
- System dashboard: CPU / RAM / disk
- Session auth for the panel
- Docker-based development environment

## v0.2 — hosting essentials

- Coexistence with existing panels (aaPanel/cPanel-style layouts): configurable PHP-FPM socket paths and nginx layout detection
- File manager: browse, edit, upload and download per-site files
- Cron jobs UI (per site and per user)
- MySQL database UI: create databases/users, manage grants
- Server logs viewer: nginx, PHP-FPM and agent audit log
- Multi-PHP management: several PHP versions installed and switchable per site

## v0.3 — operations

- DNS zones (PowerDNS or BIND) with a record editor
- Backups: scheduled archives shipped to S3-compatible storage
- One-click WordPress install (database, files, SSL, admin credentials)
- User roles: admin / reseller / client with scoped site access

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

- **Email hosting** — IP reputation and the abuse/support burden are a product on their own.
- **Windows servers** — the agent targets Linux (systemd, nginx, certbot) exclusively.
- **Kubernetes-style orchestration** — CloudDeck manages one to a few VPSes, not a cluster.
