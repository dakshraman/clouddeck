# CloudDeck API contracts

> **Frozen interface document.** All workstreams code against this. If something must change, change it here first.

Two layers:

1. **Agent API** — the privileged Go agent (`agent/`). HTTP + JSON on localhost. Source of truth for system/site state.
2. **Panel API** — Next.js route handlers (`panel/src/app/api/**`). The browser talks only to this. It authenticates the user and proxies to the agent.

Error format (both layers): `{"error": {"code": "machine_code", "message": "Human readable message"}}`

## 1. Agent API

Base URL: `http://127.0.0.1:9090` (configurable via `AGENT_LISTEN`). Prefix `/v1`. No auth in v0.1 — the agent binds localhost-only by design (see architecture.md).

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | Liveness + version |
| GET | `/v1/system` | Host metrics (CPU/RAM/disk) + `agentVersion` and `agentTime` |
| GET | `/v1/php/versions` | Offered PHP versions |
| GET | `/v1/sites` | List sites |
| POST | `/v1/sites` | Create site → `202 {taskId}` |
| GET | `/v1/sites/{domain}` | One site |
| DELETE | `/v1/sites/{domain}` | Delete site → `202 {taskId}` |
| POST | `/v1/sites/{domain}/ssl` | Issue Let's Encrypt certificate → `202 {taskId}` |
| GET | `/v1/sites/{domain}/files` | List directory (file manager) |
| GET | `/v1/sites/{domain}/files/content` | Read a text file (editor) |
| PUT | `/v1/sites/{domain}/files/content` | Write a text file (editor save) |
| GET | `/v1/sites/{domain}/files/download` | Download a file (stream) |
| POST | `/v1/sites/{domain}/files/upload` | Upload file(s), multipart |
| POST | `/v1/sites/{domain}/files/mkdir` | Create directory |
| POST | `/v1/sites/{domain}/files/rename` | Rename/move within the webroot |
| DELETE | `/v1/sites/{domain}/files` | Delete file or directory |
| GET | `/v1/mysql/status` | MariaDB/MySQL availability + version |
| GET | `/v1/mysql/databases` | List databases |
| POST | `/v1/mysql/databases` | Create database |
| DELETE | `/v1/mysql/databases/{name}` | Delete database |
| GET | `/v1/mysql/users` | List (non-system) users |
| POST | `/v1/mysql/users` | Create user |
| DELETE | `/v1/mysql/users/{user}?host=` | Delete user |
| POST | `/v1/mysql/grants` | Grant ALL on a database to a user |
| GET | `/v1/services` | Probe web-stack services (nginx/mysql/php-fpm) |
| POST | `/v1/services/{name}/restart` | Restart one service (sync, audited) |
| GET | `/v1/dns/status` | PowerDNS availability + version |
| GET | `/v1/dns/zones` | List DNS zones |
| POST | `/v1/dns/zones` | Create a DNS zone → `201` |
| DELETE | `/v1/dns/zones/{zone}` | Delete a DNS zone |
| GET | `/v1/dns/zones/{zone}/records` | List zone records |
| POST | `/v1/dns/zones/{zone}/records` | Add a record → `201` |
| DELETE | `/v1/dns/zones/{zone}/records?name=&type=` | Delete a record set (RRset) |
| GET | `/v1/backups` | List local backup archives |
| POST | `/v1/backups` | Create a backup (site/database) → `202 {taskId}` |
| GET | `/v1/backups/{id}` | One archive's metadata |
| GET | `/v1/backups/{id}/download` | Download an archive (stream) |
| POST | `/v1/backups/{id}/restore` | Restore an archive → `202 {taskId}` |
| DELETE | `/v1/backups/{id}` | Delete an archive (sync, audited) |
| GET | `/v1/tasks` | Recent tasks, newest first (max 50) |
| GET | `/v1/tasks/{id}` | One task, including logs |

**Examples**

`GET /v1/health` →
```json
{"status":"ok","version":"0.2.0","hostname":"web-1","os":"linux/amd64","dryRun":false}
```

`POST /v1/sites` body `{"domain":"example.com","phpVersion":"8.3"}` → `202`
```json
{"taskId":"t_9f3a2b"}
```
Validation: `400` invalid domain, `409` already exists. `404` for unknown site on GET/DELETE.

`POST /v1/sites/{domain}/ssl` body `{"email":"you@example.com"}` → `202 {"taskId":"..."}`.
Fails asynchronously (task `failed`) when certbot is not installed.

**Task object**
```json
{
  "id": "t_9f3a2b",
  "type": "site.create",
  "site": "example.com",
  "status": "running",
  "createdAt": "2026-10-16T12:00:00Z",
  "startedAt": "2026-10-16T12:00:00Z",
  "finishedAt": null,
  "logs": [
    {"at": "2026-10-16T12:00:01Z", "level": "info", "message": "Creating webroot /www/wwwroot/example.com"}
  ],
  "error": null
}
```
- `status`: `pending` → `running` → `succeeded` | `failed` (terminal states never change)
- `type`: `site.create` | `site.delete` | `ssl.issue` | `backup.create` | `backup.restore`
- `level`: `info` | `warn` | `error`
- Logs capped at 500 entries per task; last 200 tasks kept. `finishedAt`/`error` may be null/omitted until relevant.

**Site object**
```json
{
  "domain": "example.com",
  "root": "/www/wwwroot/example.com",
  "phpVersion": "8.3",
  "ssl": {"enabled": false},
  "status": "active",
  "createdAt": "2026-10-16T12:00:00Z",
  "updatedAt": "2026-10-16T12:00:05Z"
}
```
- `phpVersion`: any offered version or `"none"` (static site)
- `ssl`: `{enabled, issuer?, expiresAt?}`
- `status`: `active` | `provisioning` | `error`

**Dry-run:** `AGENT_DRY_RUN=true` → no system changes; rendered nginx configs are written to `<AGENT_STATE_DIR>/dryrun/<domain>.conf`; state is still persisted; health reports `dryRun:true`. Reconciliation is skipped in dry-run.

### 1.1 File manager endpoints

All file routes operate inside the site's webroot (`<AGENT_WEBROOT>/<domain>`). All are **synchronous** (no task). Mutations are written to the audit log; reads are not audited.

**Path rules (enforced identically by agent and panel UI):**
- `path` is slash-separated and **relative** to the webroot; empty string = the webroot itself.
- No leading `/`, no backslashes, no NUL, no empty/`.`/`..` segments, max 1024 chars total.
- **Symlinks are rejected**: if the target or any parent component of the resolved path is a symlink, the request fails with `409 {"code":"symlink"}`. Listings report symlinks as `type: "symlink"` but never follow or modify them (delete of the link itself is allowed).
- Escape attempts (e.g. `../../etc/passwd`) → `400 {"code":"invalid_path"}`.
- All endpoints return `409 {"code":"dry_run"}` when the agent runs in dry-run mode.

| Endpoint | Query/body | Success | Errors |
|---|---|---|---|
| `GET .../files` | `path` (default `""`) | `200 {"path","entries":[{"name","type","sizeBytes","modifiedAt"}]}` — `type`: `file`\|`dir`\|`symlink`; sorted dirs first, then name (case-insensitive) | `400 invalid_path`/`symlink`, `404 not_found` |
| `GET .../files/content` | `path` (required) | `200 {"path","content","sizeBytes"}` | `400`, `404`, `413 too_large` (> 2 MiB), `415 not_text` (not valid UTF-8) |
| `PUT .../files/content` | `{"path","content"}` | `200 {"path","sizeBytes"}` — create or overwrite; parent must exist | `400 invalid_path`/`invalid_text`, `404 parent_missing`, `409 symlink`, `413 too_large` |
| `GET .../files/download` | `path` (required) | `200` raw bytes, `Content-Disposition: attachment; filename="..."`, `Content-Type: application/octet-stream` | `400`, `404`, `413` (`is_a_directory`) |
| `POST .../files/upload` | `path` = target dir (default `""`); query `overwrite=true` optional; multipart field `file` (repeatable) | `200 {"uploaded":[{"name","sizeBytes"}]}` | `400 invalid_path`/`bad_name`, `404 not_found`, `409 exists` (unless `overwrite=true`), `413` (> 100 MiB per file) |
| `POST .../files/mkdir` | `{"path"}` — creates parents (MkdirAll) | `201 {"path"}` | `400`, `409 exists` (final directory already exists) |
| `POST .../files/rename` | `{"from","to"}` — both follow the path rules | `200 {"from","to"}` | `400`, `404 from_missing`, `409 to_exists` |
| `DELETE .../files` | `path` (required); `recursive=true` for non-empty dirs | `200 {"path","deleted":true}` | `400`, `404`, `409 not_empty` |

Upload filenames are sanitized with base-name semantics (`a/b/../x.txt` → `x.txt`); empty or `.`/`..` names → `400 bad_name`.

### 1.2 MySQL endpoints

The agent drives the local MariaDB/MySQL **client binary** (env `AGENT_MYSQL_BIN`) with argument arrays only — never a shell — and builds every SQL statement itself from validated identifiers. The API never accepts raw SQL.

**Identifiers:** database `^[A-Za-z0-9_]{1,64}$`; user `^[A-Za-z0-9_]{1,32}$`; host `^[A-Za-z0-9_.%:-]{1,255}$` (default `localhost`). System schemas (`mysql`, `information_schema`, `performance_schema`, `sys`) and system users (`root`, `mysql.sys`, `mysql.session`, `mysql.infoschema`, `mariadb.sys`, `debian-sys-maint`) are never listed, modified or dropped → `400 {"code":"system_schema"}` / `{"code":"system_user"}`.

Passwords: empty `password` → the agent generates 20 chars (`A-Za-z0-9`) and returns it **once** in the response. Provided passwords must match `^[A-Za-z0-9!@#$%^&*()_+\-=.,?]{8,64}$` (conservative charset so no SQL escaping is ever needed) → otherwise `400 weak_password`.

Credentials for the client: `AGENT_MYSQL_ROOT_USER` + `AGENT_MYSQL_ROOT_PASSWORD` (passed via the `MYSQL_PWD` environment variable, never on the command line) + optional `AGENT_MYSQL_HOST`/`AGENT_MYSQL_PORT` (empty = local socket). Client invocations are time-limited (30 s).

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/mysql/status` | — | `200 {"available":bool,"version":"10.11.10-MariaDB","kind":"mysql"\|"mariadb"\|""}` | — |
| `GET /v1/mysql/databases` | — | `200 {"databases":[{"name"}]}` | `503 mysql_unavailable` |
| `POST /v1/mysql/databases` | `{"name"}` | `201 {"name"}` | `400 invalid_name`, `409 exists`, `503` |
| `DELETE /v1/mysql/databases/{name}` | — | `200 {"name","deleted":true}` | `400 system_schema`/`invalid_name`, `404`, `503` |
| `GET /v1/mysql/users` | — | `200 {"users":[{"user","host"}]}` | `503` |
| `POST /v1/mysql/users` | `{"user","password"?,"host"?}` | `201 {"user","host","password"?}` — `password` present only when generated | `400`, `409 exists`, `503` |
| `DELETE /v1/mysql/users/{user}` | `host` query (default `localhost`) | `200 {"user","host","deleted":true}` | `400 system_user`, `404`, `503` |
| `POST /v1/mysql/grants` | `{"user","host"?,"database","privileges":"all"}` | `200 {"granted":true}` | `400 privileges`, `404 user`/`database`, `503` |

`503` body: `{"error":{"code":"mysql_unavailable","message":"..."}}` — returned when the client binary is missing or the server refuses the connection. Any other client failure → `500 {"code":"mysql_error"}` with the stderr tail as message.

### 1.3 Monitoring / service endpoints

Synchronous and audited (no tasks). The services are the host's web stack: `nginx`, `mysql`, `php-fpm`.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/services` | — | `200 {"services":[{"name","label","state","pid?","version?","details?"}]}` — `state`: `running`\|`stopped`\|`unknown`; every probe is best-effort | — |
| `POST /v1/services/{name}/restart` | — | `200 {service}` — the freshly probed status after the restart command completed | `404 unknown_service`, `409 dry_run`, `412 restart_not_configured`, `502 service_restart_failed` |
| `GET /v1/processes` | `sort=cpu\|mem` (default `cpu`), `limit` 1–100 (default 15) | `200 {"processes":[{"pid","user","command","cpuPercent","memoryPercent","rssBytes"}],"totalProcesses","sampledAt"}` — read-only top-process snapshot | — |

- `label` is human readable (e.g. `Nginx (web server)`).
- Restart commands come from `AGENT_NGINX_RESTART_CMD`, `AGENT_MYSQL_RESTART_CMD`, `AGENT_PHP_FPM_RESTART_CMD`. Each value is split on whitespace into an **argument array** — it is never passed through a shell. Empty command → `412 restart_not_configured`; non-zero exit → `502 service_restart_failed` with a stderr tail (60 s timeout).
- Restarts are serialized (one at a time) and written to the audit log.
- `/v1/processes` samples `/proc` twice 300ms apart, so CPU reflects current load rather than a process lifetime average. `cpuPercent` is a per-core percentage (multi-threaded processes can exceed 100%), and `totalProcesses` counts all processes seen in both samples. The list is read-only.

### 1.4 DNS endpoints

PowerDNS zones and records driven through `pdnsutil` (`AGENT_PDNSUTIL_BIN`) with argument arrays only, serialized behind a mutex, 30 s timeout per invocation. `pdnsutil` missing → `503 {"code":"dns_unavailable"}`. All mutations are audited.

**Validation:** zone `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$` (input lowercased first); record `name` = `@` (apex) or relative labels, each `_?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?` (leading `_` allowed for service records like `_dmarc`), ≤ 253 chars; record `type` ∈ `A,AAAA,CNAME,MX,TXT,NS,SRV,CAA`; `ttl` 0–604800 (0 = PowerDNS default); `content` non-empty, ≤ 512 chars, no control characters. `TXT` values are quoted for PowerDNS automatically; the API always returns them unquoted.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/dns/status` | — | `200 {"available":bool,"version?","confDir?"}` | — |
| `GET /v1/dns/zones` | — | `200 {"zones":[{"name"}]}` — native zones | `503` |
| `POST /v1/dns/zones` | `{"name"}` | `201 {"zone":{"name"}}` — creates a native zone (SOA included) | `400 invalid_zone`, `409 zone_exists`, `409 dry_run`, `503` |
| `DELETE /v1/dns/zones/{zone}` | — | `200 {"zone","deleted":true}` | `400 invalid_zone`, `404 zone_not_found`, `409 dry_run`, `503` |
| `GET /v1/dns/zones/{zone}/records` | — | `200 {"records":[{"name","type","ttl","content"}]}` — includes SOA/NS; `name` relative (`@` = apex) | `400 invalid_zone`, `404 zone_not_found`, `503` |
| `POST /v1/dns/zones/{zone}/records` | `{"name","type","content","ttl"?}` | `201 {"record"}` | `400 invalid_record`, `404 zone_not_found`, `409 dry_run`, `503` |
| `DELETE /v1/dns/zones/{zone}/records?name=&type=` | — | `200 {"name","type","deleted":true}` — deletes the whole RRset | `400 invalid_record`, `404 zone_not_found`/`record_not_found`, `409 dry_run`, `503` |

### 1.5 Backup endpoints

Archives live in `AGENT_BACKUP_DIR` with deterministic names: `site-<domain>-<unix>.tar.gz` (site files) and `database-<name>-<unix>.sql.gz` (mysqldump). The `id` in URLs is the file name and matches `^[a-z0-9][a-z0-9._-]{0,199}$`.

Creating and restoring run as **tasks** (`backup.create`, `backup.restore`) with live logs; the task's `site` field carries the domain or database name. Listing, download and deletion are synchronous.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/backups` | — | `200 {"backups":[{"id","kind","source","sizeBytes","createdAt"}]}` newest first; unparseable files are skipped | — |
| `POST /v1/backups` | `{"kind":"site"\|"database","site"?,"database"?,"uploads":[...]}` | `202 {"taskId"}` | `400 invalid_request`, `404 site_not_found`/`database_not_found`, `409 dry_run`, `412 telegram_not_configured` |
| `GET /v1/backups/{id}` | — | `200 {archive}` | `400 invalid_id`, `404 backup_not_found` |
| `GET /v1/backups/{id}/download` | — | `200` raw bytes, `Content-Disposition: attachment` | `400 invalid_id`, `404 backup_not_found` |
| `POST /v1/backups/{id}/restore` | — | `202 {"taskId"}` — site: extracts into the existing site's webroot; database: feeds the dump into the existing database (no tables are dropped) | `400 invalid_id`, `404 backup_not_found`/`site_not_found`/`database_not_found`, `409 dry_run` |
| `DELETE /v1/backups/{id}` | — | `200 {"id","deleted":true}` | `400 invalid_id`, `404 backup_not_found`, `409 dry_run` |

**Create request details:**
- `kind:"site"` requires `site` (domain of an existing site); `kind:"database"` requires `database` (existing database, validated through the MySQL client).
- `uploads` (optional): `[{"type":"telegram"}]` sends the archive via the Bot API (`AGENT_TELEGRAM_BOT_TOKEN` + `AGENT_TELEGRAM_CHAT_ID`, base URL overridable with `AGENT_TELEGRAM_API` for tests); `[{"type":"rclone","remote":"gdrive:clouddeck/backups"}]` runs `rclone copy <archive> <remote>` (binary `AGENT_RCLONE_BIN`). Upload errors fail the task; the local archive is kept either way. Google Drive/MEGA/Dropbox are all reached through rclone remotes.
- Database dumps use `AGENT_MYSQLDUMP_BIN` with the configured MySQL credentials (password via `MYSQL_PWD`, never on the command line).

### 1.6 Mail endpoints

The mail subsystem is **file-backed**: it reads and writes the same files an MTA (Postfix/Exim) and Dovecot consume in a standard virtual-user setup, so it works with whatever is installed — no mail server is required for the API itself. Every path is overridable (section 3). Mutations are synchronous, audited (`mail.*`), and followed by `AGENT_MAIL_RELOAD_CMD` when configured. In dry-run mode every mail **mutation** returns `409 {"error":{"code":"dry_run"}}`; reads still work.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/mail/status` | — | `200 {"baseDir","hostname","domains","accounts","dkimEnabled"}` (counts) | — |
| `GET /v1/mail/domains` | — | `200 {"domains":[...]}` sorted | — |
| `POST /v1/mail/domains` | `{"domain"}` | `201 {"domain"}` | `400 invalid_domain`, `409 mail_domain_exists` |
| `DELETE /v1/mail/domains/{domain}` | — | `200 {"domain","deleted":true}` — also removes that domain's accounts, forwarders and autoresponders | `400 invalid_domain`, `404 mail_domain_not_found` |
| `GET /v1/mail/accounts` | `?domain=` (optional) | `200 {"accounts":[{"email","domain","quotaMb","bytes","createdAt"}]}` sorted by email | `400 invalid_domain` |
| `POST /v1/mail/accounts` | `{"email","password","quotaMb"}` | `201 {account}` — creates the passwd-file entry + maildir | `400 invalid_email`/`invalid_password`/`invalid_quota`, `404 mail_domain_not_found`, `409 mail_account_exists` |
| `DELETE /v1/mail/accounts/{email}` | — | `200 {"email","deleted":true}` — passwd entry removed, maildir kept on disk | `400 invalid_email`, `404 mail_account_not_found` |
| `POST /v1/mail/accounts/{email}/password` | `{"password"}` | `200 {"email","updated":true}` | `400 invalid_email`/`invalid_password`, `404 mail_account_not_found` |
| `POST /v1/mail/accounts/{email}/quota` | `{"quotaMb"}` | `200 {"email","quotaMb","updated":true}` | `400 invalid_email`/`invalid_quota`, `404 mail_account_not_found` |
| `GET /v1/mail/forwarders` | `?domain=` | `200 {"forwarders":[{"source","target","createdAt"}]}` | `400 invalid_domain` |
| `POST /v1/mail/forwarders` | `{"source","target"}` | `201 {"source","target"}` — target may be one address or a comma-separated list | `400 invalid_email`, `404 mail_domain_not_found`, `409 forwarder_exists` |
| `DELETE /v1/mail/forwarders/{source}` | — | `200 {"source","deleted":true}` | `400 invalid_email`, `404 forwarder_not_found` |
| `GET /v1/mail/autoresponders/{email}` | — | `200 {autoresponder}` | `400 invalid_email`, `404 autoresponder_not_found` |
| `PUT /v1/mail/autoresponders/{email}` | `{"subject","body","enabled"}` | `200 {autoresponder}` (upsert; rewrites the sieve file) | `400 invalid_email`/`invalid_autoresponder`, `404 mail_domain_not_found` |
| `DELETE /v1/mail/autoresponders/{email}` | — | `200 {"email","deleted":true}` | `400 invalid_email`, `404 autoresponder_not_found` |
| `GET /v1/mail/dkim/{domain}` | — | `200 {"domain","selector","enabled","dnsName","dnsRecord","dnsApplied"}` (selector `clouddeck`; `enabled:false` when absent) | `400 invalid_domain` |
| `POST /v1/mail/dns/{domain}` | `{"spf":true,"dmarcPolicy":"none"\|"quarantine"\|"reject"\|"","dkim":true,"mx":true}` | `200 {"applied":{"spf"\|"dmarc"\|"dkim"\|"mx":"<record value>"},"errors":[...]}` — keyed by record part because SPF and MX share the apex name; generates/keeps the DKIM keypair, publishes requested records into the domain's PowerDNS zone; per-record failures land in `errors` (e.g. `zone example.com not found`) | `400 invalid_domain`/`invalid_request` |

**File layouts (defaults under `AGENT_MAIL_ROOT`):**
- Domains: one domain per line.
- Users (Dovecot passwd-file): 8 colon fields — `user@domain.com:{SHA256}<base64>:5000:5000::<vhosts>/user@domain.com::` and, when `quotaMb > 0`, an extra space-separated field `userdb_quota_rule=*:bytes=<quotaMb*1048576>`. Passwords are never logged.
- Aliases (Postfix virtual alias syntax): `source target1, target2` — one entry per line.
- Autoresponders: `autoreply/<email>.sieve` (vacation script) + `autoreply/<email>.json` metadata `{"email","subject","body","enabled","updatedAt"}`.
- DKIM: `dkim/<domain>.key` (RSA-2048, PEM PKCS#8), `dkim/<domain>.txt` (the full `v=DKIM1; k=rsa; p=...` TXT value), metadata in `dkim/<domain>.json`. DNS name: `clouddeck._domainkey.<domain>`.
- Maildirs: `<vhosts>/<email>/{cur,new,tmp}`.
- SPF preset: `v=spf1 a mx ~all`; DMARC preset: `v=DMARC1; p=<policy>`; MX: `10 <AGENT_MAIL_HOSTNAME>`; TTL 3600.

**Validation:** emails are lowercased; local part `^[a-z0-9]([a-z0-9._-]{0,62})?$`; domain must be a listed mail domain (shared domain regex); password ≥ 8 characters; quota 0–1048576 MB (0 = unlimited).

### 1.7 Site operation endpoints

Subdomains, redirects, cron, PHP switching, IP blocking, usage/stats/logs. Mutations are synchronous + audited except subdomain create/delete (tasks). Renders go through the standard nginx flow (`nginx -t` → reload, rollback on failed test).

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/sites/{domain}/subdomains` | — | `200 {"subdomains":[{"name","createdAt"}]}` | `400 invalid_domain`, `404 site_not_found` |
| `POST /v1/sites/{domain}/subdomains` | `{"name"}` | `202 {"taskId"}` (`site.subdomain.create`) | `400 invalid_domain`/`invalid_subdomain`, `404 site_not_found`, `409 subdomain_exists`, `409 dry_run` |
| `DELETE /v1/sites/{domain}/subdomains/{name}` | — | `202 {"taskId"}` (`site.subdomain.delete`) | `400`, `404 subdomain_not_found`, `409 dry_run` |
| `GET /v1/sites/{domain}/redirects` | — | `200 {"redirects":[{"id","from","to","permanent"}]}` | `400`, `404` |
| `POST /v1/sites/{domain}/redirects` | `{"from":"/old","to":"https://x","permanent":true}` | `200 {"redirects":[...]}` (updated, insertion order) | `400 invalid_redirect`, `404 site_not_found`, `409 dry_run` |
| `DELETE /v1/sites/{domain}/redirects/{id}` | — | `200 {"redirects":[...]}` | `400`, `404 redirect_not_found` |
| `GET /v1/sites/{domain}/cron` | — | `200 {"cron":[{"id","schedule","command","comment","createdAt"}]}` | `400`, `404` |
| `POST /v1/sites/{domain}/cron` | `{"schedule":"0 3 * * *","command":"/usr/bin/php ...","comment"?}` | `200 {"cron":[...]}` — rewrites `<AGENT_CRON_DIR>/clouddeck-<domain dots→dashes>` | `400 invalid_cron`, `404 site_not_found` |
| `DELETE /v1/sites/{domain}/cron/{id}` | — | `200 {"cron":[...]}` | `400`, `404 cron_not_found` |
| `PUT /v1/sites/{domain}/php` | `{"version":"8.3"}` | `200 {site}` — re-renders the vhost with that version's socket and reloads; reverts on failure | `400 invalid_php_version`, `404 site_not_found` |
| `GET /v1/sites/{domain}/security` | — | `200 {"blockedIps":[{"ip","note","createdAt"}]}` | `400`, `404` |
| `POST /v1/sites/{domain}/security/block` | `{"ip","note"?}` | `200 {"blockedIps":[...]}` | `400 invalid_ip`, `404 site_not_found`, `409 ip_exists` |
| `DELETE /v1/sites/{domain}/security/block/{ip}` | — | `200 {"blockedIps":[...]}` | `400 invalid_ip`, `404 ip_not_found` |
| `GET /v1/sites/{domain}/usage` | — | `200 {"domain","root","bytes","files"}` — walks the webroot, skips symlinks | `400`, `404` |
| `GET /v1/sites/{domain}/stats` | `?days=7` (1–90) | `200 {"domain","days","requests","bytes","perDay":[{"date","requests","bytes"}],"topPaths":[{"path","requests"}]}` — combined-format access log, days ascending, top 10 paths | `400 invalid_days`, `404` |
| `GET /v1/sites/{domain}/logs` | `?kind=access\|error&lines=200` (1–2000) | `200 {"domain","kind","lines":["..."]}` — tail of `<AGENT_LOG_DIR>/<domain>.access.log` / `.error.log`; missing file → empty list | `400 invalid_kind`/`invalid_lines`, `404 site_not_found` |

**Rendering rules (frozen):**
- A subdomain adds its own `server` block: `server_name <name>.<domain>`, root `<site root>/<name>` (placeholder index.html on create), same PHP config and log files as the main site. `name` must match `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` and must not be `www`.
- Redirects render as `location <from> { return 301|302 <to>; }` inside every server block of the site. `from` starts with `/`, 1–512 chars, no whitespace/quotes/`;`/`{`/`}`; `to` is an absolute `http(s)://` URL ≤ 2048 chars. IDs are 8 lowercase hex chars.
- Blocked IPs render as `deny <ip>;` lines in every server block (IPv4 or IPv6 via `net.ParseIP`).
- Cron: 5 space-separated fields, each `^[0-9*/,\-]{1,20}$`; command 1–1024 chars, no newlines; run as `root`.
- PHP sockets: `AGENT_PHP_SOCK_MAP` maps `version → socket` (e.g. `8.3=/tmp/php-cgi-83.sock`); versions absent from the map fall back to `AGENT_PHP_FPM_SOCK` template substitution. Version is validated with the same `php.Offered` check as site creation.

### 1.8 Backup schedule endpoints

One global recurring schedule (cPanel-style backup wizard). When due — checked every minute by an agent goroutine — it starts `backup.create` tasks for every site (and every non-system database when `includeDatabases`), then prunes older *scheduled* archives beyond `keep`; manual archives are never pruned. Persisted at `<AGENT_STATE_DIR>/backup_schedule.json` plus a run ledger for pruning bookkeeping.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/backups/schedule` | — | `200 {schedule}` — defaults when never set: `{"enabled":false,"frequency":"daily","time":"03:00","weekday":0,"keep":7,"includeDatabases":false}` | — |
| `PUT /v1/backups/schedule` | schedule object | `200 {schedule}` — validates, persists, recomputes `nextRunAt` | `400 invalid_schedule`, `409 dry_run` |
| `POST /v1/backups/schedule/run` | — | `202 {"started":N}` — runs the same task set as a due run | `409 dry_run` |

Fields: `enabled`; `frequency` `"daily"`|`"weekly"`; `time` `"HH:MM"` server-local; `weekday` 0–6 (Sunday=0, weekly only); `keep` 1–365 (scheduled archives kept per source); `includeDatabases`; `uploads` (same shape as backup create) applied to every archive; read-only `lastRunAt`, `nextRunAt`, `lastError`.

### 1.9 v0.5 toolbox endpoints

New in v0.5: FTP accounts, web terminal, SSH keys, phpMyAdmin access, remote MySQL hosts, aggregate cron, per-site WAF, and the file-manager completion (chmod/copy/compress/extract). All mutations are synchronous + audited; only the terminal stream is SSE.

#### FTP accounts (pure-ftpd)

Virtual FTP logins backed by `AGENT_FTP_PASSWD_FILE` (pure-ftpd passwd format `login:hash:uid:gid:gecos:home:shell`, SHA-512 crypt hashes). After every mutation the agent runs `AGENT_FTP_RELOAD_CMD` (whitespace-split argv, never a shell) when set — e.g. `pure-pw mkdb`. Home directories are created under the site root, owned by `AGENT_FTP_RUNAS`. Site webroots the agent creates are owned by `AGENT_WEB_RUNAS` when set so accounts whose home is the site root can upload; pre-existing directories and files are never re-owned.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/ftp/status` | — | `200 {passwdFile,runAs,accounts}` | — |
| `GET /v1/ftp/accounts` | — | `200 {accounts:[{name,home,uid,gid,site?,subdir?}]}` — `site`/`subdir` derived by the server from the owning site root | — |
| `POST /v1/ftp/accounts` | `{site,subdir?,name,password}` — `name` matches `^[A-Za-z0-9][A-Za-z0-9._@-]{1,32}$`, password ≥ 8 chars | `200 {accounts:[...]}` | `400 invalid_name`/`invalid_password`/`invalid_path`, `404 site_not_found`, `409 ftp_user_exists`, `409 dry_run` |
| `DELETE /v1/ftp/accounts/{name}` | — | `200 {accounts:[...]}` — home directory is kept | `404 ftp_user_not_found`, `409 dry_run` |
| `POST /v1/ftp/accounts/{name}/password` | `{password}` | `204` | `400 invalid_password`, `404 ftp_user_not_found`, `409 dry_run` |

Audit actions: `ftp.create`, `ftp.delete`, `ftp.password`.

#### Web terminal (`/v1/term/*`)

PTY-backed shell running as `AGENT_TERM_USER` (default `root`) via `AGENT_TERM_SHELL`. At most 4 live sessions; idle sessions are killed after 15 minutes. Output streams over SSE, input is base64. Disabled (`409 term_disabled`) under `dry_run`.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/term/status` | — | `200 {enabled,user,shell,sessions}` | — |
| `POST /v1/term/sessions` | `{cols,rows}` (8–500 each, defaults 80×24) | `201 {id,user,shell,cols,rows,startedAt}` | `409 term_disabled`, `429 too_many_sessions` |
| `GET /v1/term/sessions/{id}/stream` | — | `200 text/event-stream`: `event: out` + base64 chunk, `event: exit` + exit code, `: ping` keepalives | `404 term_session_not_found` |
| `POST /v1/term/sessions/{id}/input` | `{data}` base64 | `204` | `400 invalid_input`, `404 term_session_not_found` |
| `POST /v1/term/sessions/{id}/resize` | `{cols,rows}` | `204` | `400 invalid_size`, `404 term_session_not_found` |
| `DELETE /v1/term/sessions/{id}` | — | `204` | `404 term_session_not_found` |

Audit actions: `term.session.start`, `term.session.close`.

#### SSH keys (`/v1/ssh/*`)

Manages `AGENT_SSH_KEYS_FILE` (authorized_keys) and generated keypairs under `AGENT_SSH_KEY_DIR` (created with `AGENT_SSH_KEYGEN_BIN`). Existing non-CloudDeck lines are preserved; delete matches by fingerprint.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/ssh/status` | — | `200 {user,keysFile,keyDir,port,hostname}` | — |
| `GET /v1/ssh/keys` | — | `200 {keys:[{type,fingerprint,comment?,line}]}` | — |
| `POST /v1/ssh/keys` | `{key}` — one OpenSSH public-key line (`ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256/384/521`) | `201 {key}` | `400 invalid_key`, `409 key_exists`, `409 dry_run` |
| `DELETE /v1/ssh/keys?fingerprint=SHA256:…` | — | `200 {keys:[...]}` | `400 invalid_fingerprint`, `404 key_not_found`, `409 dry_run` |
| `GET /v1/ssh/keys/generated` | — | `200 {keys:[{name,type,comment?,fingerprint,publicKey}]}` | — |
| `POST /v1/ssh/keys/generated` | `{name,type,comment?}` — `type` `"ed25519"` or `"rsa"` | `201 {key:{…,privateKey}}` (private material returned once, download from the panel) | `400 invalid_name`/`invalid_key_type`, `409 key_exists`, `409 dry_run` |
| `GET /v1/ssh/keys/generated/{name}` | — | `200 {key:{…,privateKey}}` | `404 key_not_found` |
| `DELETE /v1/ssh/keys/generated/{name}` | — | `200 {keys:[...]}` | `404 key_not_found`, `409 dry_run` |

Audit actions: `ssh.key.add`, `ssh.key.delete`, `ssh.keygen.create`, `ssh.keygen.delete`.

#### phpMyAdmin access

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/phpmyadmin/status` | — | `200 {installed,dir?,port?,version?,urlPath?,reachable,authType?}` — detection only; `reachable` is a localhost HTTP probe of the discovered URL | — |
| `POST /v1/phpmyadmin/login` | — | `200 {port,urlPath,cookies:[{name,value,path?,maxAge?,httpOnly?,secure?,sameSite?}]}` — cookie-auth login with the agent's MySQL root credentials; the cookies are handed to the browser. Non-cookie auth returns no cookies and only the URL. | `500 internal` |

#### Remote MySQL hosts

Clones `user@localhost` (authentication hash + grants) to an extra host so clients can connect remotely. The localhost entry is never modified or dropped.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/mysql/remote` | — | `200 {users:[…]}` — every non-local `user@host` | — |
| `POST /v1/mysql/remote` | `{user,host}` — `host` is an IP, hostname, or `%` | `201 {user}` | `400 invalid_user`/`invalid_host`/`invalid_host_local`, `404 mysql_user_not_found`, `409 mysql_user_exists`, `409 dry_run` |
| `DELETE /v1/mysql/remote/{user}?host=` | — | `200 {user}` | `400 invalid_host_local`, `404 mysql_user_not_found`, `409 dry_run` |

Audit actions: `mysql.remote.add`, `mysql.remote.delete`.

#### Aggregate cron + per-site WAF

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/cron` | — | `200 {sites:[{domain,jobs:[…]}]}` — every site, sorted by domain | — |
| `GET /v1/sites/{domain}/waf` | — | `200 {enabled,engine,note?}` — `engine` is `"nginx-rules"` or `"modsecurity"`, detected from the nginx binary's `-V` modules | `404 site_not_found` |
| `PUT /v1/sites/{domain}/waf` | `{enabled}` | `200 {enabled,engine,note?}` — re-renders the vhost (apply/test/reload with rollback) | `404 site_not_found`, `409 dry_run` |

The cron fragment user column is the job's `runAs` (`"root"` default, or `"www"`). Audit action: `site.waf.set`. IP blocking accepts IPv4/IPv6 addresses and CIDR ranges (`invalid_ip` covers both).

#### File-manager completion (`/v1/sites/{domain}/files/*`)

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `POST …/files/chmod` | `{path,mode}` — octal `"644"` or `"0755"` | `200 {path}` | `400 invalid_mode`, `404 file_not_found`, symlink refused |
| `POST …/files/copy` | `{from,to,overwrite?}` | `200 {from,to}` | `404 file_not_found`, `409 file_exists` (without `overwrite`), `413 too_large` (500 MiB / 20 000 entries), `409 dry_run` |
| `POST …/files/compress` | `{paths:[…],format,target}` — `format` `"tar.gz"` or `"zip"` | `200 {path}` | `400 invalid_format`/`invalid_path`, `404 file_not_found`, `409 file_exists`, `413 too_large`, `409 dry_run` |
| `POST …/files/extract` | `{archive,dest}` — `.tar.gz`/`.tgz`/`.zip` | `200 {path}` | `400 invalid_archive`, `404 file_not_found`, `413 too_large`, `409 dry_run` |

Audit actions: `files.chmod`, `files.copy`, `files.compress`, `files.extract`.

### 1.10 v0.6 application hosting, firewall and security

New in v0.6: application runtimes, supervised app processes behind nginx, the host firewall, and a security overview (ModSecurity / fail2ban / SSH posture). App create/update/delete/start/stop are synchronous + audited, and each mutation re-renders the owning site's vhost (apply / `nginx -t` / reload with rollback).

#### Runtimes

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/runtimes` | — | `200 {runtimes:[{kind,label,description,defaultPort?,versions:[{kind,label,version,bin?,default?}],available}],supervisor:{backend,note}}` — `kind` is `static`, `php`, `node`, `python`, `go`, `ruby` or `custom`; detection looks at well-known install paths plus `PATH` | — |

`supervisor.backend` is the configured process manager (`systemd`, `pm2` or `supervisor`).

#### Applications

An app belongs to a site (`site` + `name` is the key, `name` matches `^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$`), runs as `AGENT_WEB_RUNAS` when set, and listens on a local port the agent allocates (3000–3999 unless `port` is given and free). A site with exactly one app serves it at `/`; a site with several apps mounts each at `/<name>/` and leaves `/` static.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/apps` | `?site=` (optional) | `200 {apps:[…]}` | — |
| `POST /v1/apps` | `{site,name,kind,command,dir?,version?,bin?,port?,env?,healthPath?,autoRestart?}` — `dir` is relative to the site root, `command` runs through `/bin/sh -lc` with `$PORT` exported | `201 app` | `400 invalid_name`/`invalid_kind`/`invalid_command`/`invalid_port`, `404 site_not_found`, `409 app_exists`/`port_in_use`, `409 dry_run` |
| `GET /v1/sites/{domain}/apps` | — | `200 {apps:[…]}` | `404 site_not_found` |
| `GET /v1/sites/{domain}/apps/{name}` | — | `200 app` | `404 site_not_found`, `404 app_not_found` |
| `PUT /v1/sites/{domain}/apps/{name}` | `{command?,dir?,version?,bin?,port?,env?,healthPath?,autoRestart?}` | `200 app` — restart plus vhost re-render | `400 …`, `404 app_not_found`, `409 port_in_use`, `409 dry_run` |
| `DELETE /v1/sites/{domain}/apps/{name}` | — | `204` — process stopped, unit removed, vhost re-rendered | `404 app_not_found`, `409 dry_run` |
| `POST /v1/sites/{domain}/apps/{name}/start` | — | `200 app` | `404 app_not_found`, `500` when the supervisor refuses |
| `POST /v1/sites/{domain}/apps/{name}/stop` | — | `200 app` | `404 app_not_found` |
| `GET /v1/sites/{domain}/apps/{name}/logs` | `?lines=200` (1–1000) | `200 {lines:[…]}` from the supervisor log file | `404 app_not_found` |

An app response is `{id,site,name,kind,version?,bin?,command,dir,port,env,healthPath?,runAs,supervisor,autoRestart,createdAt,updatedAt,status:{state,pid?,startedAt?,uptimeSeconds?,detail?}}` where `state` is `running`, `stopped`, `error` or `unknown`.

Audit actions: `app.create`, `app.update`, `app.delete`, `app.start`, `app.stop`.

#### Firewall

Backed by `ufw` or `firewalld`, whichever the host runs. CloudDeck only ever deletes rules it created (identified by a comment marker); pre-existing rules are never touched.

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/firewall` | — | `200 {backend,available,enabled,detail?,defaults?,rules:[{id,port,protocol,action,from?,comment?,createdAt}]}` | — |
| `PUT /v1/firewall` | `{enabled}` | `200` status after the change | `409 firewall_unavailable`, `409 dry_run` |
| `POST /v1/firewall/rules` | `{port,protocol,action,from?,comment?}` — `protocol` `tcp`/`udp`, `action` `allow`/`deny`, `from` a CIDR or address | `201 rule` | `400 invalid_port`/`invalid_protocol`/`invalid_action`/`invalid_from`, `409 rule_exists`, `409 dry_run` |
| `DELETE /v1/firewall/rules/{id}` | — | `200` status | `404 rule_not_found`, `409 dry_run` |

Audit actions: `firewall.rule.add`, `firewall.rule.delete`, `firewall.set`.

#### Security overview

| Endpoint | Body/query | Success | Errors |
|---|---|---|---|
| `GET /v1/security` | — | `200 {modsec,fail2ban,ssh,checks}` — see below | — |
| `GET /v1/security/modsec` | — | `200 modsec` | — |
| `POST /v1/security/unban` | `{jail,ip}` | `200 {ok:true}` | `400 invalid_jail`/`invalid_ip`, `409 fail2ban_unavailable` |
| `PUT /v1/security/jails/{jail}` | `{enabled}` | `200 {ok:true}` | `400 invalid_jail`, `409 fail2ban_unavailable` |

`modsec` is `{moduleInstalled,modulePath?,crsInstalled,crsPath?,engine,note?}` where `engine` is `modsecurity` when the nginx module is loaded, otherwise `nginx-rules` (the built-in per-site rules). `fail2ban` is `{installed,active,jails:[{name,banned,total,ips,enabled}],note?}`. `ssh` reports the effective `port`, `permitRootLogin`, `passwordAuthentication` and `pubkeyAuthentication` read from `sshd_config` and its drop-ins. `checks` is the hardening checklist: `[{id,label,status,detail,hint?}]` with `status` `pass`, `warn`, `fail` or `info`.

Audit action: `security.unban`.

## 2. Panel API

Same-origin, prefix `/api`. Session cookie `cd_session` (HttpOnly, SameSite=Lax, 7 days). Every route except `/api/auth/login` and `/api/auth/logout` returns `401 {"error":{"message":"unauthorized"}}` without a valid session. Until the first account exists the panel runs in **setup mode**: page requests are redirected to `/setup` and API routes answer `403 {"error":{"code":"setup_required","message":"setup required"}}`. Completing `POST /api/setup` (with `PANEL_SEED_*` unset) creates the admin account, signs it in, and disables setup mode permanently.

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → `200 {user:{username}}` + Set-Cookie; `401` invalid |
| POST | `/api/setup` | First-run only: `{username,password,email?}` → `201 {user:{username}}` + Set-Cookie (setup wizard, auto sign-in); `400 invalid_setup`, `409 already_setup` |
| POST | `/api/auth/logout` | → `204`, clears cookie |
| GET | `/api/auth/me` | → `{user:{username,email,createdAt},session:{ttlDays,cookieSecure}}` or `401` |
| PATCH | `/api/auth/me` | `{email?,currentPassword?,newPassword?}` → updated `{user,session}`; `400 invalid_email`, `400 invalid_current_password`, `400 current_password_required` |
| GET | `/api/system` | Passthrough agent `/v1/system` (includes `agentVersion`, `agentTime`) |
| GET | `/api/panel` | → `{version,agentUrl,cookieSecure,sessionTtlDays,nodeVersion}` |
| GET | `/api/updates` | → `{panelVersion,latest,checkedAt,error}`; `?refresh=1` forces a GitHub check (min 60s between checks) |
| GET | `/api/php-versions` | Passthrough → `{versions:[...]}` |
| GET | `/api/sites` | → `{sites:[...]}` |
| POST | `/api/sites` | `{domain,phpVersion}` → `202 {taskId}` |
| GET | `/api/sites/{domain}` | → site |
| DELETE | `/api/sites/{domain}` | → `202 {taskId}` |
| POST | `/api/sites/{domain}/ssl` | `{email}` → `202 {taskId}` |
| GET | `/api/sites/{domain}/files` | `?path=` → file listing (proxied) |
| GET | `/api/sites/{domain}/files/content` | `?path=` → text content |
| PUT | `/api/sites/{domain}/files/content` | `{path,content}` → write |
| GET | `/api/sites/{domain}/files/download` | `?path=` → streamed download |
| POST | `/api/sites/{domain}/files/upload` | multipart, `?path=` → upload |
| POST | `/api/sites/{domain}/files/mkdir` | `{path}` → create dir |
| POST | `/api/sites/{domain}/files/rename` | `{from,to}` → rename |
| DELETE | `/api/sites/{domain}/files` | `?path=&recursive=` → delete |
| GET | `/api/mysql/status` | passthrough `/v1/mysql/status` |
| GET | `/api/mysql/databases` | list |
| POST | `/api/mysql/databases` | `{name}` |
| DELETE | `/api/mysql/databases/{name}` | delete |
| GET | `/api/mysql/users` | list |
| POST | `/api/mysql/users` | `{user,password?,host?}` — may return generated password |
| DELETE | `/api/mysql/users/{user}` | `?host=` |
| POST | `/api/mysql/grants` | `{user,host?,database,privileges}` |
| GET | `/api/services` | passthrough `/v1/services` |
| POST | `/api/services/{name}/restart` | restart a service (proxied) |
| GET | `/api/dns/status` | passthrough `/v1/dns/status` |
| GET | `/api/dns/zones` | list zones |
| POST | `/api/dns/zones` | `{name}` → create zone |
| DELETE | `/api/dns/zones/{zone}` | delete zone |
| GET | `/api/dns/zones/{zone}/records` | list records |
| POST | `/api/dns/zones/{zone}/records` | `{name,type,content,ttl?}` → add record |
| DELETE | `/api/dns/zones/{zone}/records` | `?name=&type=` → delete RRset |
| GET | `/api/backups` | list archives |
| POST | `/api/backups` | `{kind,site?,database?,uploads?}` → `202 {taskId}` |
| GET | `/api/backups/{id}/download` | streamed download |
| POST | `/api/backups/{id}/restore` | → `202 {taskId}` |
| DELETE | `/api/backups/{id}` | delete archive |
| GET | `/api/tasks` | → `{tasks:[...]}` |
| GET | `/api/tasks/{id}` | → task |
| GET | `/api/mail/status` | passthrough `/v1/mail/status` |
| GET/POST | `/api/mail/domains` | list / `{domain}` |
| DELETE | `/api/mail/domains/{domain}` | delete domain (+ its accounts) |
| GET/POST | `/api/mail/accounts` | list (`?domain=`) / `{email,password,quotaMb}` |
| DELETE | `/api/mail/accounts/{email}` | delete mailbox |
| POST | `/api/mail/accounts/{email}/password` | `{password}` |
| POST | `/api/mail/accounts/{email}/quota` | `{quotaMb}` |
| GET/POST | `/api/mail/forwarders` | list (`?domain=`) / `{source,target}` |
| DELETE | `/api/mail/forwarders/{source}` | delete alias |
| GET/PUT/DELETE | `/api/mail/autoresponders/{email}` | get / `{subject,body,enabled}` / delete |
| GET | `/api/mail/dkim/{domain}` | DKIM status |
| POST | `/api/mail/dns/{domain}` | `{spf?,dmarcPolicy?,dkim?,mx?}` → published records |
| GET/POST | `/api/sites/{domain}/subdomains` | list / `{name}` → `202 {taskId}` |
| DELETE | `/api/sites/{domain}/subdomains/{name}` | → `202 {taskId}` |
| GET/POST | `/api/sites/{domain}/redirects` | list / `{from,to,permanent}` → updated list |
| DELETE | `/api/sites/{domain}/redirects/{id}` | → updated list |
| GET/POST | `/api/sites/{domain}/cron` | list / `{schedule,command,comment?,runAs?}` (`runAs` `"root"`\|`"www"`) → updated list |
| DELETE | `/api/sites/{domain}/cron/{id}` | → updated list |
| PUT | `/api/sites/{domain}/php` | `{version}` → site |
| GET | `/api/sites/{domain}/security` | blocked-IP list |
| POST | `/api/sites/{domain}/security/block` | `{ip,note?}` → updated list |
| DELETE | `/api/sites/{domain}/security/block/{ip}` | → updated list |
| GET | `/api/sites/{domain}/usage` | disk usage |
| GET | `/api/sites/{domain}/stats` | `?days=7` |
| GET | `/api/sites/{domain}/logs` | `?kind=access\|error&lines=200` |
| GET/PUT | `/api/backups/schedule` | get / set schedule |
| POST | `/api/backups/schedule/run` | run now → `202 {started}` |
| GET | `/api/cron` | aggregate cron passthrough `/v1/cron` |
| GET/POST | `/api/ftp/accounts` | list / `{site,subdir?,name,password}` |
| DELETE | `/api/ftp/accounts/{name}` | delete account |
| POST | `/api/ftp/accounts/{name}/password` | `{password}` |
| GET | `/api/ftp/status` | passthrough `/v1/ftp/status` |
| GET | `/api/term/status` | passthrough `/v1/term/status` |
| POST | `/api/term/sessions` | `{cols,rows}` → `201 {id,…}` |
| GET | `/api/term/sessions/{id}/stream` | SSE passthrough (`text/event-stream`) |
| POST | `/api/term/sessions/{id}/input` | `{data}` base64 |
| POST | `/api/term/sessions/{id}/resize` | `{cols,rows}` |
| DELETE | `/api/term/sessions/{id}` | close session |
| GET | `/api/ssh/status` | passthrough `/v1/ssh/status` |
| GET/POST | `/api/ssh/keys` | list / `{key}` |
| DELETE | `/api/ssh/keys` | `?fingerprint=` |
| GET/POST | `/api/ssh/keys/generated` | list / `{name,type,comment?}` |
| GET/DELETE | `/api/ssh/keys/generated/{name}` | read (incl. private) / delete |
| GET | `/api/phpmyadmin/status` | passthrough `/v1/phpmyadmin/status` |
| GET | `/api/phpmyadmin/login` | authenticate via the agent, set phpMyAdmin cookies, redirect to the discovered phpMyAdmin URL |
| GET | `/api/mysql/remote` | list remote hosts |
| POST | `/api/mysql/remote` | `{user,host}` |
| DELETE | `/api/mysql/remote/{user}` | `?host=` |
| GET/PUT | `/api/sites/{domain}/waf` | get / `{enabled}` |
| POST | `/api/sites/{domain}/files/chmod` | `{path,mode}` |
| POST | `/api/sites/{domain}/files/copy` | `{from,to,overwrite?}` |
| POST | `/api/sites/{domain}/files/compress` | `{paths,format,target}` |
| POST | `/api/sites/{domain}/files/extract` | `{archive,dest}` |
| GET | `/api/runtimes` | passthrough `/v1/runtimes` |
| GET | `/api/apps` | `?site=` → `{apps:[...]}` (proxied) |
| POST | `/api/apps` | `{site,name,kind,command,…}` → `201 app` |
| GET/PUT/DELETE | `/api/sites/{domain}/apps/{name}` | read / update / delete |
| POST | `/api/sites/{domain}/apps/{name}/start` | start the process |
| POST | `/api/sites/{domain}/apps/{name}/stop` | stop the process |
| GET | `/api/sites/{domain}/apps/{name}/logs` | `?lines=200` → `{lines:[...]}` |
| GET/PUT | `/api/firewall` | status / `{enabled}` |
| POST | `/api/firewall/rules` | `{port,protocol,action,from?,comment?}` |
| DELETE | `/api/firewall/rules/{id}` | delete a CloudDeck-managed rule |
| GET | `/api/security` | passthrough `/v1/security` |
| POST | `/api/security` | `{jail,ip}` → unban |
| PUT | `/api/security/jails/{jail}` | `{enabled}` |

The panel validates input again (same domain regex, same path/identifier rules) → `400` with a clear message. Agent errors pass through with their original HTTP status and JSON body wherever sensible (the file/MySQL proxies forward status + body unchanged; downloads stream `Content-Disposition` through).

**Next.js 15 notes (panel code):**
- Dynamic route handlers: `ctx: { params: Promise<{ domain: string }> }`, then `const { domain } = await ctx.params;`
- `cookies()` is async: `const store = await cookies();`
- GET route handlers are cached by default — every route file must have `export const dynamic = "force-dynamic";` and `export const runtime = "nodejs";`

## 3. Environment variables

**Agent** (all optional):

| Var | Default |
|---|---|
| `AGENT_LISTEN` | `127.0.0.1:9090` |
| `AGENT_STATE_DIR` | `./data` |
| `AGENT_NGINX_SITES_DIR` | `/etc/nginx/conf.d` |
| `AGENT_WEBROOT` | `/www/wwwroot` |
| `AGENT_PHP_BASE` | `/etc/php` |
| `AGENT_LOG_DIR` | `/var/log/nginx` |
| `AGENT_PHP_FPM_SOCK` | `/run/php/php{{version}}-fpm.sock` (`{{version}}` → site PHP version; aaPanel uses `/tmp/php-cgi-{{version}}.sock`) |
| `AGENT_MYSQL_BIN` | `mysql` |
| `AGENT_MYSQL_ROOT_USER` | `root` |
| `AGENT_MYSQL_ROOT_PASSWORD` | (empty — socket auth / client defaults) |
| `AGENT_MYSQL_HOST` | (empty — local socket) |
| `AGENT_MYSQL_PORT` | (empty) |
| `AGENT_DRY_RUN` | `false` |
| `AGENT_NGINX_RESTART_CMD` | (empty — nginx restarts disabled). Split on whitespace into argv; never a shell |
| `AGENT_MYSQL_RESTART_CMD` | (empty) |
| `AGENT_PHP_FPM_RESTART_CMD` | (empty) |
| `AGENT_PDNSUTIL_BIN` | `pdnsutil` |
| `AGENT_PDNS_CONF_DIR` | `/etc/powerdns` |
| `AGENT_PDNS_CONTROL_BIN` | `pdns_control` |
| `AGENT_BACKUP_DIR` | `/var/lib/clouddeck/backups` |
| `AGENT_RCLONE_BIN` | `rclone` |
| `AGENT_MYSQLDUMP_BIN` | `mysqldump` |
| `AGENT_TELEGRAM_BOT_TOKEN` | (empty — Telegram uploads disabled) |
| `AGENT_TELEGRAM_CHAT_ID` | (empty) |
| `AGENT_TELEGRAM_API` | `https://api.telegram.org` (override for tests) |
| `AGENT_MAIL_ROOT` | `$AGENT_STATE_DIR/mail` (relocates all mail state) |
| `AGENT_MAIL_DOMAINS_FILE` | `$AGENT_MAIL_ROOT/domains` |
| `AGENT_MAIL_USERS_FILE` | `$AGENT_MAIL_ROOT/users` (Dovecot passwd-file) |
| `AGENT_MAIL_ALIASES_FILE` | `$AGENT_MAIL_ROOT/aliases` (Postfix virtual aliases) |
| `AGENT_MAIL_AUTOREPLY_DIR` | `$AGENT_MAIL_ROOT/autoreply` |
| `AGENT_MAIL_DKIM_DIR` | `$AGENT_MAIL_ROOT/dkim` |
| `AGENT_MAIL_VHOSTS_DIR` | `$AGENT_MAIL_ROOT/vhosts` (maildir root) |
| `AGENT_MAIL_RELOAD_CMD` | (empty — no reload). Split on whitespace into argv; never a shell |
| `AGENT_MAIL_HOSTNAME` | system hostname (MX target) |
| `AGENT_PHP_SOCK_MAP` | (empty — falls back to `AGENT_PHP_FPM_SOCK`) e.g. `8.3=/tmp/php-cgi-83.sock,8.4=/tmp/php-cgi-84.sock` |
| `AGENT_CRON_DIR` | `/etc/cron.d` (site cron fragments) |
| `AGENT_FTP_PASSWD_FILE` | `$AGENT_STATE_DIR/ftp/passwd` (pure-ftpd passwd file) |
| `AGENT_FTP_RUNAS` | `www` (unix user owning FTP home dirs) |
| `AGENT_FTP_RELOAD_CMD` | (empty — no reload). Whitespace-split argv, e.g. `pure-pw mkdb`; never a shell |
| `AGENT_WEB_RUNAS` | (empty — ownership left untouched). Unix user owning site webroots the agent creates |
| `AGENT_TERM_USER` | `root` (unix user the web-terminal shell runs as) |
| `AGENT_TERM_SHELL` | `/bin/bash` |
| `AGENT_SSH_KEYS_FILE` | `/root/.ssh/authorized_keys` |
| `AGENT_SSH_KEY_DIR` | `/root/.ssh/clouddeck-keys` |
| `AGENT_SSH_CONFIG` | `/etc/ssh/sshd_config` (read for the Port) |
| `AGENT_SSH_KEYGEN_BIN` | `ssh-keygen` |
| `AGENT_PHPMYADMIN_DIR` | `/www/server/phpmyadmin` |
| `AGENT_NGINX_BIN` | `nginx` (used only for `-V` WAF module detection) |
| `AGENT_MODSEC_CONF` | `/etc/nginx/modsec/clouddeck.conf` (rules file when the ModSecurity module exists) |
| `AGENT_APP_SUPERVISOR` | `systemd` (also `pm2` or `supervisor`) |
| `AGENT_APP_UNIT_DIR` | `/etc/systemd/system` (systemd unit directory) |
| `AGENT_APP_SUPERVISOR_DIR` | `/etc/supervisor/conf.d` (supervisord `conf.d` directory; must match `[include] files` in `supervisord.conf`) |
| `AGENT_APP_LOG_DIR` | `$AGENT_STATE_DIR/logs/apps` |

The firewall and security services discover `ufw`, `firewall-cmd` and `fail2ban-client` on `PATH`; there are no overrides for them.

**Panel:**

| Var | Default |
|---|---|
| `AGENT_URL` | `http://127.0.0.1:9090` |
| `PANEL_SESSION_SECRET` | `dev-secret-change-me` (warns; **must** change in production) |
| `PANEL_DATA_DIR` | `./data` |
| `PANEL_SEED_ADMIN` | (unset — panel starts in first-run setup mode) |
| `PANEL_SEED_PASSWORD` | (unset) |

Setting both `PANEL_SEED_*` vars creates that admin account on first start and skips the web setup wizard (unattended provisioning, e.g. containers/CI).

## 4. Cross-workstream rules

- Shared TypeScript types: `panel/src/lib/types.ts` — import via `@/lib/types`, never edit outside the orchestrator.
- Session helpers, exported from `@/lib/session`: `getSession(): Promise<SessionUser | null>` and `requireSession(): Promise<SessionUser>` (redirects to `/login` when invalid).
- Task polling: UI polls `GET /api/tasks/{id}` every 1000 ms until status is `succeeded` or `failed`.
- Domain validation regex (agent, panel, and UI hint): `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$` — lowercase input before validating.
- v0.2 file manager + MySQL mutations are **synchronous and audited**. v0.3: service restarts, DNS changes and backup deletion are synchronous + audited; backup create/restore are tasks (`backup.create`/`backup.restore`). Tasks exist only for slow flows (site create/delete, SSL issue, backups).
- Panel routes for v0.3 (/api/services, /api/dns/**, /api/backups/**) mirror the agent shape 1:1.
- v0.4: mail and site-operation mutations are synchronous + audited (`mail.*`, `site.*`) except subdomain create/delete and every backup run (tasks). Panel routes for v0.4 mirror the agent shape 1:1.
- v0.5: toolbox mutations are synchronous + audited (`ftp.*`, `term.*`, `ssh.*`, `mysql.remote.*`, `site.waf.set`, `files.*`); the terminal `stream` endpoint is SSE and the panel proxies it as a streaming body. Cron jobs gained `runAs`; IP blocking gained CIDR. Panel routes mirror the agent shape 1:1.
- v0.6: app, firewall and security-unban mutations are synchronous + audited (`app.*`, `firewall.*`, `security.unban`). Every app mutation re-renders the owning site's vhost through `sites.ApplyNginx`. The panel forwards to the agent with `src/lib/agent-proxy.ts` (`proxyAgent(path, method, body)`), which passes status and body through unchanged.
