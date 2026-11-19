# AI Agents Expansion, Site Doctor & API Key Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three major AI and autonomous server capabilities for CloudDeck: (1) Additional coding & local LLM agents (Aider, Ollama, Goose), (2) CloudDeck-native SysAdmin & Site Doctor auto-healing engine, and (3) AI Platform Enhancements including an API Key Vault with terminal injection and an in-panel Server AI Chat assistant.

**Architecture:**
- **Agents Extension (`agent/internal/agents`)**: Register Aider, Ollama, and Goose alongside Claude, Codex, Antigravity, and OpenCode. Support Ollama model management (`POST /v1/agents/ollama/pull`).
- **Site & Server Doctor (`agent/internal/doctor`)**: Autonomous diagnostic and remediation engine. Inspects error logs, permissions, PHP-FPM, MySQL connectivity, and missing PHP extensions; executes safe 1-click fixes.
- **API Key Vault & Terminal Injection (`agent/internal/agents/vault.go`)**: Securely stores LLM credentials in `/var/lib/clouddeck/agent_keys.json` (0600) and injects them into web terminal sessions and agent background tasks.
- **Server AI Chat (`agent/internal/agents/chat.go`)**: In-panel assistant backed by configured keys or local Ollama, equipped with real-time server diagnostics context.
- **Frontend (`panel/src`)**: Integrated into `/agents`, `/sites/[domain]`, navigation, and a global floating AI Chat drawer.

**Tech Stack:** Go 1.23+, Next.js 16.4.6, React 19, TypeScript, Tailwind CSS, Lucide Icons, bash.

---

## Global Constraints
- Preserve zero-root security architecture (Next.js runs unprivileged, Go agent runs privileged on 127.0.0.1:9090).
- All command executions must use typed argument slices (`exec.CommandContext`), never raw string shell interpolation (`sh -c`).
- Encrypted/stored credentials in `/var/lib/clouddeck/agent_keys.json` must be permission-restricted (0600) and masked in GET responses.
- All Go packages must pass `go test -v ./...` and `go vet ./...`.
- All Next.js pages and API routes must pass `npm run typecheck` and `npm run build` without warnings.

---

## Review Focus
1. **Ollama Local Engine & Model Pulling**: Ollama might not be running or model pull might take time; must execute via background tasks (`tasks.Manager`) with non-blocking progress reporting.
2. **Site Doctor Permission Safety**: Chmod/chown repairs must stay strictly confined within the site's document root (`store.Site.Root`) and prevent path traversal outside `/var/www` or `/home`.
3. **API Key Masking**: `GET /v1/agents/keys` must never expose unmasked API secret keys to API clients; only prefix/suffix (e.g. `sk-ant-...3f8a`) or boolean `set: true`.
4. **Terminal Environment Merging**: Term session environment variables must cleanly merge without overriding system PATH or term settings.
5. **AI Chat Fallback**: When no external API key is configured and Ollama is absent, the chat endpoint must return actionable diagnostic instructions rather than crashing.

---

### Task 1: Expand AI Coding Agents (Aider, Ollama, Goose)

**Files:**
- Modify: `agent/internal/agents/agents.go`
- Modify: `agent/internal/agents/agents_test.go`
- Modify: `panel/src/components/agents/agent-card.tsx`
- Modify: `panel/src/app/(dashboard)/agents/page.tsx`
- Modify: `panel/src/lib/types.ts`
- Modify: `docs/api.md`

**Steps:**
- [ ] 1.1 Add `aider`, `ollama`, and `goose` specs in `agent/internal/agents/agents.go` with detection rules, package names, capabilities, and install/uninstall commands.
- [ ] 1.2 Add Ollama model management helper (`ListLocalModels`, `PullModel`) in `agent/internal/agents/ollama.go` connecting to `http://127.0.0.1:11434/api`.
- [ ] 1.3 Add route `POST /v1/agents/ollama/pull` in `agent/internal/server/agents.go` using `s.eng.Create("agent.ollama.pull", ...)`.
- [ ] 1.4 Write unit tests in `agents_test.go` verifying spec resolution, dry-run install, and Ollama model parsing.
- [ ] 1.5 Update `panel/src/lib/types.ts` with new agent types and Ollama model responses.
- [ ] 1.6 Update `panel/src/components/agents/agent-card.tsx` with customized badges (Local LLM for Ollama, Git Pair Programmer for Aider) and Ollama model pull trigger.
- [ ] 1.7 Run `go test ./internal/agents/...` and `npm run typecheck` to verify cleanly passing.

---

### Task 2: CloudDeck Site Doctor & Server Health Engine

**Files:**
- Create: `agent/internal/doctor/doctor.go`
- Create: `agent/internal/doctor/doctor_test.go`
- Create: `agent/internal/server/doctor.go`
- Create: `agent/internal/server/doctor_test.go`
- Modify: `agent/internal/server/server.go`
- Create: `panel/src/components/site/site-doctor-card.tsx`
- Create: `panel/src/components/system/server-doctor-modal.tsx`
- Create: `panel/src/app/api/sites/[domain]/doctor/route.ts`
- Create: `panel/src/app/api/sites/[domain]/doctor/fix/route.ts`
- Create: `panel/src/app/api/system/doctor/route.ts`
- Create: `panel/src/app/api/system/doctor/fix/route.ts`
- Modify: `panel/src/app/(dashboard)/sites/[domain]/page.tsx`
- Modify: `panel/src/lib/types.ts`

**Steps:**
- [ ] 2.1 Implement `doctor.Service` in `agent/internal/doctor/doctor.go` with `DiagnoseSite(ctx, domain)` inspecting:
  - Error logs (`/var/log/nginx/error.log` and site logs) for recent 500/502/504 errors.
  - Webroot permissions and ownership against PHP execution user (`www-data`).
  - `.env` / `wp-config.php` database connection validation.
  - Missing PHP extensions for WordPress/Laravel (e.g. `mbstring`, `pdo_mysql`, `curl`, `xml`, `zip`).
- [ ] 2.2 Implement `FixSiteIssue(ctx, domain, fixId)` supporting automated permission fix, PHP-FPM socket restart, and missing extension install.
- [ ] 2.3 Implement `DiagnoseServer(ctx)` and `FixServerIssue(ctx, fixId)` for disk cleanup, rotated logs truncation, and stale temp file removal.
- [ ] 2.4 Add HTTP endpoints in `agent/internal/server/doctor.go` (`POST /v1/sites/{domain}/doctor`, `POST /v1/sites/{domain}/doctor/fix`, `POST /v1/system/doctor`, `POST /v1/system/doctor/fix`).
- [ ] 2.5 Add unit and integration tests in `doctor_test.go` and `server/doctor_test.go`.
- [ ] 2.6 Build `panel/src/components/site/site-doctor-card.tsx` with health score, issue list, and 1-click Auto-Fix buttons.
- [ ] 2.7 Embed Site Doctor card on `panel/src/app/(dashboard)/sites/[domain]/page.tsx`.
- [ ] 2.8 Add API proxy route handlers in Next.js.
- [ ] 2.9 Verify with `go test ./internal/doctor/...` and `npm run typecheck`.

---

### Task 3: API Key & Model Vault with Terminal Auto-Injection

**Files:**
- Create: `agent/internal/agents/vault.go`
- Create: `agent/internal/agents/vault_test.go`
- Create: `agent/internal/server/vault.go`
- Create: `agent/internal/server/vault_test.go`
- Modify: `agent/internal/server/server.go`
- Modify: `agent/internal/term/session.go`
- Create: `panel/src/components/agents/api-key-vault-card.tsx`
- Create: `panel/src/app/api/agents/keys/route.ts`
- Modify: `panel/src/app/(dashboard)/agents/page.tsx`
- Modify: `panel/src/lib/types.ts`

**Steps:**
- [ ] 3.1 Implement `vault.Store` in `agent/internal/agents/vault.go` to store masked/encrypted keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OLLAMA_HOST`, `GROQ_API_KEY`) in `/var/lib/clouddeck/agent_keys.json` with mode 0600.
- [ ] 3.2 Implement `GetMaskedKeys()`, `SetKeys(keys)`, and `GetEnvironment() []string`.
- [ ] 3.3 Hook `vault.GetEnvironment()` into `internal/term/session.go` (`startSession`) so web terminal sessions automatically have credentials loaded.
- [ ] 3.4 Add HTTP endpoints `GET /v1/agents/keys` and `POST /v1/agents/keys` in `agent/internal/server/vault.go`.
- [ ] 3.5 Write tests for vault persistence, key masking, and environment injection.
- [ ] 3.6 Create `panel/src/components/agents/api-key-vault-card.tsx` with secret inputs, show/hide toggle, and "Save Credentials" feedback.
- [ ] 3.7 Add API route `panel/src/app/api/agents/keys/route.ts`.
- [ ] 3.8 Add the Vault Card to `/agents` view.
- [ ] 3.9 Verify with `go test ./internal/agents/...` and `npm run typecheck`.

---

### Task 4: In-Panel Server AI Chat Assistant

**Files:**
- Create: `agent/internal/agents/chat.go`
- Create: `agent/internal/agents/chat_test.go`
- Create: `agent/internal/server/chat.go`
- Modify: `agent/internal/server/server.go`
- Create: `panel/src/components/agents/ai-chat-drawer.tsx`
- Create: `panel/src/app/api/agents/chat/route.ts`
- Modify: `panel/src/app/(dashboard)/layout.tsx`
- Modify: `panel/src/lib/types.ts`

**Steps:**
- [ ] 4.1 Implement `chat.Service` in `agent/internal/agents/chat.go`: collects server context snapshot (load, memory, disks, sites, failing services, doctor alerts) and dispatches prompt to configured LLM (Ollama endpoint or Anthropic/OpenAI/Gemini API).
- [ ] 4.2 Add fallback heuristic response engine for offline/zero-key environments that answers questions about server health and provides actionable CLI commands.
- [ ] 4.3 Add HTTP endpoint `POST /v1/agents/chat` in `agent/internal/server/chat.go`.
- [ ] 4.4 Build `panel/src/components/agents/ai-chat-drawer.tsx`: floating trigger button with badge, slide-over drawer, message history, streaming or typing state, and quick prompt chips ("Why is RAM high?", "Diagnose site errors", "Show recent logins").
- [ ] 4.5 Add `panel/src/app/api/agents/chat/route.ts` proxying chat requests.
- [ ] 4.6 Include `AIChatDrawer` in `panel/src/app/(dashboard)/layout.tsx` so it is globally accessible across CloudDeck.
- [ ] 4.7 Verify with `go test ./internal/agents/...` and `npm run typecheck`.

---

### Task 5: End-to-End Verification, Build & Release

**Files:**
- Modify: `agent/internal/server/server.go` (Version: "0.6.53")
- Modify: `panel/package.json` (Version: "0.6.53")
- Modify: `site/package.json` (Version: "0.6.53")
- Modify: `scripts/install.sh` (Version: "v0.6.53")
- Modify: `scripts/install-windows.ps1` (Version: "0.6.53")
- Modify: `docs/api.md`

**Steps:**
- [ ] 5.1 Run full Go test suite: `cd agent && go test -v ./... && go vet ./...`.
- [ ] 5.2 Run panel Next.js 16 typecheck, lint, and production build: `cd panel && npm run typecheck && npm run lint && npm run build`.
- [ ] 5.3 Run site Next.js 16 build: `cd site && npm run build`.
- [ ] 5.4 Check installer scripts syntax (`bash -n scripts/install.sh`).
- [ ] 5.5 Bump version to `v0.6.53` across all 5 version files.
- [ ] 5.6 Commit, tag `v0.6.53`, push to `main`, and verify GitHub Actions CI/Release pass.
