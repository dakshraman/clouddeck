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
| GET | `/v1/system` | Host metrics (CPU/RAM/disk) |
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
- `type`: `site.create` | `site.delete` | `ssl.issue`
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

## 2. Panel API

Same-origin, prefix `/api`. Session cookie `cd_session` (HttpOnly, SameSite=Lax, 7 days). Every route except `/api/auth/login` and `/api/auth/logout` returns `401 {"error":{"message":"unauthorized"}}` without a valid session. Until the first account exists the panel runs in **setup mode**: page requests are redirected to `/setup` and API routes answer `403 {"error":{"code":"setup_required","message":"setup required"}}`. Completing `POST /api/setup` (with `PANEL_SEED_*` unset) creates the admin account, signs it in, and disables setup mode permanently.

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → `200 {user:{username}}` + Set-Cookie; `401` invalid |
| POST | `/api/setup` | First-run only: `{username,password,email?}` → `201 {user:{username}}` + Set-Cookie (setup wizard, auto sign-in); `400 invalid_setup`, `409 already_setup` |
| POST | `/api/auth/logout` | → `204`, clears cookie |
| GET | `/api/auth/me` | → `{user:{username}}` or `401` |
| GET | `/api/system` | Passthrough agent `/v1/system` |
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
| GET | `/api/tasks` | → `{tasks:[...]}` |
| GET | `/api/tasks/{id}` | → task |

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
- File manager + MySQL mutations are **synchronous and audited**; tasks exist only for slow provisioning flows (site create/delete, SSL issue).
