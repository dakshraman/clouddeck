# cPanel-class parity: what we learned from the cPanel installer

CloudDeck aims to be cPanel-class hosting management, built original — no copied
cPanel code, assets, or wording. This document records what the public 2026
cPanel layer-1 installer (v00189) actually does, based on reading its own
scripts, and maps it to the CloudDeck plan.

**Evidence method.** The installer was downloaded and inspected, never executed:
`latest` (Makeself bootstrap) plus its embedded payload
(`install`, `Installer.pm`, `InstallerRhel.pm`, `InstallerUbuntu.pm`,
`CpanelConfig.pm`, `CpanelMySQL.pm`, `OSDetect.pm`). Facts below are labeled
observed (read from those files) or docs-based (public cPanel documentation
knowledge, listed for completeness). CloudDeck's own implementations remain
independent.

## What the installer reveals

### Products, configuration, update model *(observed)*

- Three products: `standard` (cPanel & WHM), `dnsonly` (DNS-only server),
  `wp2` ("WP Squared", a WordPress platform).
- Server state lives under `/var/cpanel`; the main server config is
  `/var/cpanel/cpanel.config`. Unattended pre-install config is
  `/root/cpanel_profile/cpanel.config`, copied into place early.
- Update plumbing: `/etc/cpupdate.conf` (tier: edge/current/release/…),
  `/etc/cpsources.conf` (source `httpupdate.cpanel.net`, `MYIP`), tier map from
  `/cpanelsync/TIERS`. Versions are `11.<lts>.*`.
- Licensing: IP-based check against `verify.cpanel.net` (trial mode exists).

### Install shape: two layers *(observed)*

1. **Layer 1** (this installer): OS support check → conflict purge →
   cPanel Perl bootstrap (`/cpanelsync/<ver>/cpanel/scripts/*.xz`) →
   `updatenow` → hands off to
   `/usr/local/cpanel/scripts/cpanel_initial_install`.
2. **Layer 2** installs the actual service stack cPanel owns.

### The stack cPanel takes over *(observed via purge list + package bootstrap; ports docs-based)*

| Area | cPanel choice | Notes |
|---|---|---|
| Web | Apache (EasyApache 4), optional nginx front | ports 80/443 |
| Mail (MTA) | Exim | 25/465/587 |
| Mail (IMAP/POP) | Dovecot | 143/993/110/995 |
| Webmail | cPanel webmail frontend | 2096 |
| Databases | MySQL 8.0/8.4 or MariaDB 10.5/10.6/10.11/11.4/11.8 | version chosen at install |
| FTP | pure-ftpd | 21 |
| DNS | BIND (default, `/var/named`) or PowerDNS — `local_nameserver_type` accepts `powerdns`, `bind`, `disabled` | 53 |
| Panel daemons | cpsrvd serves WHM 2087, cPanel 2083, webmail 2096 | observed as the product split |
| System | cron, quota, sysstat | precursor packages |
| Value-adds (optional) | CloudLinux conversion, ImunifyAV/360, WP Toolkit | bundled install options |

### Ubuntu specifics *(observed)*

- Supported: **Ubuntu 22.04 and 24.04 only, fresh installs only**.
  MariaDB requires cPanel LTS ≥ 117.
- Purges conflicting packages before installing:
  `apache2-*`, `dovecot-*`, `exim4-*`, `postfix`, `sendmail`, `spamassassin`,
  `mysql-*`, `mariadb-*`, `pure-ftpd`, `proftpd-basic`, `unattended-upgrades`.
- Disables `systemd-resolved` and rewrites `/etc/resolv.conf` (cloud-init or
  1.1.1.1/8.8.8.8); needs `keyserver.ubuntu.com` for MariaDB GPG keys;
  checks usrmerge (`/bin`, `/sbin`, `/lib` symlinks).
- Clean-server gate: refuses when another control panel is detected (Plesk,
  DirectAdmin, Ensim, …), errors when `/var/lib/mysql` is non-empty, and warns
  "This installer will overwrite all of your configuration files."

### Consequences we adopt

1. **Same coexistence philosophy as our agent** — the admin installs the
   service stack (nginx/PHP/MySQL/mail/DNS); the panel discovers and manages it
   via typed operations. We are not rebuilding Apache/Exim into CloudDeck; we
   are building the management layer for whatever the admin runs — exactly how
   CloudDeck already treats nginx/PHP-FPM, MySQL and now PowerDNS.
2. **The installer confirms our ordering**: DB version and nameserver type are
   first-class *choices*, DNS is a product on its own (dnsonly), and web/mail/
   FTP/DNS/backup each are service areas with their own management surface.
3. **CloudDeck differentiators stay**: single Go agent, no shell interpolation,
   typed argv-only operations, full audit log, one-command install with setup
   in the browser.

## Feature map (cPanel → CloudDeck)

| cPanel area | cPanel does | CloudDeck today (v0.4.0) | Plan |
|---|---|---|---|
| Email accounts | Dovecot mailboxes, quotas | **shipped (v0.4)**: file-backed domains, mailboxes (`{SHA256}` passwd-file), quotas, maildirs | — |
| Forwarders / aliases | MTA alias maps | **shipped (v0.4)**: Postfix virtual-alias syntax | — |
| Autoresponders, filters | vacation + sieve | **shipped (v0.4)**: sieve vacation scripts | — |
| Spam handling | SpamAssassin/EB integration | — | backlog (whatever stack is installed) |
| Webmail | bundled webmail frontend | — | backlog (link/deploy Roundcube-class) |
| DKIM / SPF / DMARC | manages keys, writes DNS | **shipped (v0.4)**: RSA-2048 key management, one-click SPF/DMARC/MX/DKIM publishing | — |
| DNS zones / records | Zone Editor, BIND or PowerDNS | **PowerDNS shipped (v0.3)** | BIND driver later if needed |
| DNS-only server | `dnsonly` product | — | optional variant, later |
| Addon domains, subdomains, aliases | per-site management | **shipped (v0.4)**: subdomains (own vhost blocks) and redirects per site | addon domains backlog |
| File manager | full file manager | **shipped (v0.2)** | — |
| Disk usage per site | usage views | **shipped (v0.4)**: per-site usage + access-log statistics | — |
| FTP accounts | pure-ftpd accounts, quotas | — | backlog |
| Backup & restore | wizard, remote destinations, scheduling | **shipped (v0.3+v0.4)**: site+db, local/Telegram/rclone, scheduled runs with retention | — |
| MySQL/MariaDB | databases, users, remote access | **shipped (v0.2)**: db/user/grants | remote access later |
| PHP versions | per-directory handler, ini editor | **shipped (v0.4)**: per-site switching via socket map | ini editor backlog |
| SSL/TLS | AutoSSL, cert manager | **per-site Let's Encrypt (v0.2)** | AutoSSL-style renewal surface |
| Cron jobs | full cron UI | **shipped (v0.4)**: per-site jobs → `/etc/cron.d` fragments | per-user cron backlog |
| Bandwidth / visitors stats | per-domain reports | **shipped (v0.4)**: per-site requests/bytes/per-day/top-paths from access logs | — |
| IP blocker / WAF-lite | cphulk, ModSecurity | **shipped (v0.4)**: per-site deny list | full WAF / cphulk backlog |
| One-click installers | Softaculous, WP Toolkit | — | backlog (WordPress via wp-cli first) |
| WHM service manager | restart/config services | **services page shipped (v0.3)** | — |
| WHM packages / resellers / quotas | packages, resellers, limits | single-admin | v0.5 (multi-server), resellers later |
| Nameserver selection | bind / powerdns / disabled | PowerDNS integration (v0.3) | selection UI later |

## Prioritized milestones

- **v0.4.0 — shipped:** mail stack (domains, mailboxes, quotas, forwarders,
  autoresponders, DKIM + SPF/DMARC/MX helpers), site operations (subdomains,
  redirects, cron, PHP switching, IP blocker, per-site disk/bandwidth, log
  viewer), scheduled backups with retention.
- **v0.4+ — remaining gaps:** webmail frontend, SpamAssassin integration, FTP
  accounts, one-click WordPress (wp-cli first), php.ini editor, AutoSSL-style
  renewal surface.
- **v0.5 — multi-server:** one panel managing several agents (the WHM-shaped
  layer), keeping the agent contract identical.
- **Later:** IP blocker/WAF-lite, one-click installer, reseller/quotas.

## Deliberately not copied

No cPanel code, templates, assets or wording; no license/update mechanics; no
CloudLinux/Imunify bundling behavior. Features are re-implemented as typed,
audited operations on the admin's installed stack.
