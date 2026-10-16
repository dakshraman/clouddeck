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
| GET | `/v1/tasks` | Recent tasks, newest first (max 50) |
| GET | `/v1/tasks/{id}` | One task, including logs |

**Examples**

`GET /v1/health` →
```json
{"status":"ok","version":"0.1.0","hostname":"web-1","os":"linux/amd64","dryRun":false}
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

## 2. Panel API

Same-origin, prefix `/api`. Session cookie `cd_session` (HttpOnly, SameSite=Lax, 7 days). Every route except `/api/auth/login` and `/api/auth/logout` returns `401 {"error":{"message":"unauthorized"}}` without a valid session.

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → `200 {user:{username}}` + Set-Cookie; `401` invalid |
| POST | `/api/auth/logout` | → `204`, clears cookie |
| GET | `/api/auth/me` | → `{user:{username}}` or `401` |
| GET | `/api/system` | Passthrough agent `/v1/system` |
| GET | `/api/php-versions` | Passthrough → `{versions:[...]}` |
| GET | `/api/sites` | → `{sites:[...]}` |
| POST | `/api/sites` | `{domain,phpVersion}` → `202 {taskId}` |
| GET | `/api/sites/{domain}` | → site |
| DELETE | `/api/sites/{domain}` | → `202 {taskId}` |
| POST | `/api/sites/{domain}/ssl` | `{email}` → `202 {taskId}` |
| GET | `/api/tasks` | → `{tasks:[...]}` |
| GET | `/api/tasks/{id}` | → task |

The panel validates input again (same domain regex, rudimentary email check) → `400` with a clear message. Agent errors pass through with their original HTTP status where sensible.

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
| `AGENT_DRY_RUN` | `false` |

**Panel:**

| Var | Default |
|---|---|
| `AGENT_URL` | `http://127.0.0.1:9090` |
| `PANEL_SESSION_SECRET` | `dev-secret-change-me` (warns; **must** change in production) |
| `PANEL_DATA_DIR` | `./data` |
| `PANEL_SEED_ADMIN` | `admin` (used only on first run) |
| `PANEL_SEED_PASSWORD` | `admin` (used only on first run) |

## 4. Cross-workstream rules

- Shared TypeScript types: `panel/src/lib/types.ts` — import via `@/lib/types`, never edit outside the orchestrator.
- Session helpers, exported from `@/lib/session`: `getSession(): Promise<SessionUser | null>` and `requireSession(): Promise<SessionUser>` (redirects to `/login` when invalid).
- Task polling: UI polls `GET /api/tasks/{id}` every 1000 ms until status is `succeeded` or `failed`.
- Domain validation regex (agent, panel, and UI hint): `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$` — lowercase input before validating.
