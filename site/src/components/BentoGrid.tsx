"use client";

import { useState } from "react";
import {
  Shield,
  Cpu,
  Layers,
  Server,
  Archive,
  Database,
  Mail,
  Terminal,
  Lock,
  Globe,
  HardDrive,
  Key,
  Flame,
  FileCode,
  Zap,
  Bot,
  Stethoscope,
  Clock,
  Sliders,
  MessageSquare,
  Sparkles,
} from "lucide-react";

export function BentoGrid() {
  const [activeCategory, setActiveCategory] = useState<"arch" | "ai" | "hosting" | "security">("arch");

  return (
    <section id="under-the-hood" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#886351]">
            <span>Deep Dive Architecture &bull; v0.6.53</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Engineered for <span className="text-[#235361]">performance &amp; autonomy</span>, not bloat.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            A radical departure from 1990s legacy control panels. Explore the modern foundations,
            autonomous AI agents, and bare-metal runtime engine powering CloudDeck.
          </p>
        </div>

        {/* Category Pill Switcher */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-full border border-[#D2ADAC]/60 bg-white/80 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveCategory("arch")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "arch"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              Architecture &amp; Core
            </button>
            <button
              type="button"
              id="ai-agents"
              onClick={() => setActiveCategory("ai")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "ai"
                  ? "bg-[#235361] text-[#FAAA93] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              <Bot className="h-3.5 w-3.5 text-[#FAAA93]" />
              <span>AI Agents &amp; Autonomy (NEW)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("hosting")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "hosting"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              Hosting &amp; Runtimes
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("security")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "security"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              Data, Backups &amp; Security
            </button>
          </div>
        </div>

        {/* Dynamic Bento Cards */}
        <div className="mt-12">
          {/* Category 1: Architecture & Core */}
          {activeCategory === "arch" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Zero Root */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-[#74B8CC]">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Zero-Root Web Layer
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  The Next.js 16 panel runs as an unprivileged user (<code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">clouddeck</code>).
                  A privileged Go daemon listens strictly on <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">127.0.0.1:9090</code>.
                  No browser request ever executes shell strings (<code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#886351]">no sh -c</code>).
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Typed argument arrays only
                </div>
              </div>

              {/* Card 2: Ultra-low RAM */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAAA93] text-[#14242B]">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  &lt;50 MB Idle Memory
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  cPanel consumes 1.5GB+ RAM just idling. CloudDeck runs effortlessly on a $3.50/mo
                  1-vCPU 1GB RAM cloud VPS, saving you hundreds of dollars in unnecessary infrastructure costs.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FAAA93]/20 px-2.5 py-0.5 text-xs font-bold text-[#14242B]">
                  30x lighter than cPanel
                </div>
              </div>

              {/* Card 3: Local Dev Suite */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6494AC] text-white">
                  <Server className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Local Dev Suite (XAMPP Alt)
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Turn Windows 10/11 (WSL 2) and macOS into a modern LEMP workstation with Nginx
                  production parity, multi-PHP coexistence, and automated Root CA green padlocks on <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">*.local</code>.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#6494AC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Windows PATH &amp; macOS brew
                </div>
              </div>

              {/* Card 4: Web Terminal */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#886351] text-[#FAAA93]">
                  <Terminal className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Web Terminal PTY
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Full xterm.js terminal running directly inside your browser. Synchronized credentials
                  allow instant elevation with <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">sudo -i</code> without leaving the dashboard.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#886351]/15 px-2.5 py-0.5 text-xs font-semibold text-[#886351]">
                  PTY Unix socket streaming
                </div>
              </div>

              {/* Card 5: PowerDNS */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74B8CC] text-[#235361]">
                  <Globe className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  PowerDNS Authoritative
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Built-in SQLite-backed nameserver. Manage A, AAAA, CNAME, MX, TXT, SRV, and CAA
                  records with 1-click automated publishing for mail and DKIM records.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/20 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Port 53 Native DNS
                </div>
              </div>

              {/* Card 6: 100% Go Stdlib Agent */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-white">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Zero 3rd-Party Go Dependencies
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  The Go agent daemon relies strictly on the Go standard library. No bloated dependency
                  trees, zero supply chain attack vectors, and instant single-binary execution.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#235361]/10 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Static binary &bull; stdlib only
                </div>
              </div>
            </div>
          )}

          {/* Category 2: AI Agents & Autonomy (NEW in v0.6.53) */}
          {activeCategory === "ai" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: 8 Native AI Coding Agents */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAAA93] text-[#14242B]">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  8 Native AI Coding Agents
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Inspect, manage, and launch 8 developer AI agents: Claude Code, OpenAI Codex, Google Antigravity,
                  OpenCode, Aider, Ollama (local offline models), Goose, and Hermes Agent directly in your browser terminal.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FAAA93]/20 px-2.5 py-0.5 text-xs font-bold text-[#14242B]">
                  Claude &bull; Codex &bull; Ollama &bull; Hermes
                </div>
              </div>

              {/* Card 2: Autonomous Site Doctor & Auto-Fix */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#38BD87] text-white">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Site Doctor &amp; 1-Click Auto-Fix
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Real-time 0–100 health scoring across Nginx configs, SSL expiration, DNS propagation,
                  database connectivity, and file permissions. Fix detected defects with a single click.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#38BD87]/15 px-2.5 py-0.5 text-xs font-bold text-[#38BD87]">
                  0-100 Score &bull; Autonomous Fix
                </div>
              </div>

              {/* Card 3: Encrypted AI Key Vault */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-[#74B8CC]">
                  <Key className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  AI Key Vault &bull; Auto-Injection
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Store credentials for Anthropic, OpenAI, DeepSeek, Gemini, and Ollama in a protected
                  vault (<code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">mode 0600</code>).
                  Keys are automatically exported into shell sessions upon terminal launch.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Masked secrets &bull; Terminal injection
                </div>
              </div>

              {/* Card 4: Server AI Chat Drawer */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6494AC] text-white">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Global Server AI Chat Drawer
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Floating chat assistant available anywhere in the panel with live server context
                  (CPU, RAM, sites, systemd units, logs) and multi-tier failover across Anthropic, OpenAI, DeepSeek, and Ollama.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#6494AC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Context-aware &bull; Multi-provider failover
                </div>
              </div>

              {/* Card 5: Visual Cron Job Manager */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#886351] text-[#FAAA93]">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Visual Cron Job Scheduler
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  cPanel-style scheduled tasks manager with visual recurrence selector (every minute, hourly,
                  daily, weekly, monthly, or crontab syntax). Features 1-click &quot;Run Now&quot; testing and stdout logs.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#886351]/15 px-2.5 py-0.5 text-xs font-semibold text-[#886351]">
                  Visual presets &bull; Run-Now testing
                </div>
              </div>

              {/* Card 6: PHP Extensions & Visual php.ini */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74B8CC] text-[#235361]">
                  <Sliders className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  PHP Extensions &amp; php.ini Editor
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  1-click extension toggling and installation across all coexisting PHP versions (8.1, 8.2, 8.3, 8.4)
                  for redis, imagick, opcache, curl, and intl, with visual tuning of memory limits and execution times.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  1-Click toggles &bull; Visual memory tuning
                </div>
              </div>
            </div>
          )}

          {/* Category 3: Hosting & Runtimes */}
          {activeCategory === "hosting" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Multi-PHP */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74B8CC] text-[#235361]">
                  <Zap className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Multi-PHP Coexistence (8.1–8.4)
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Switch PHP versions per site with one click. CloudDeck manages isolated Unix domain
                  sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously on bare metal without Docker overhead.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Nginx fastcgi_pass sockets
                </div>
              </div>

              {/* Card 2: Polyglot Apps */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAAA93] text-[#14242B]">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Polyglot App Supervision
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Run Node.js, Python, Go, Ruby, and custom apps. CloudDeck creates isolated systemd units,
                  allocates loopback ports, and sets up Nginx reverse proxying with live log streaming.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FAAA93]/20 px-2.5 py-0.5 text-xs font-bold text-[#14242B]">
                  systemd + Nginx proxy
                </div>
              </div>

              {/* Card 3: Production Mail Server */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-[#74B8CC]">
                  <Mail className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Production Postfix &amp; Dovecot
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Complete bare-metal email stack. Mailboxes with SHA-512 crypt passwords, quotas,
                  virtual aliases, sieve autoresponders, RSA-2048 DKIM, and automatic SPF/DMARC publishing.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#235361]/10 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  DKIM, SPF, DMARC 1-click
                </div>
              </div>

              {/* Card 4: MariaDB & phpMyAdmin */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6494AC] text-white">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  MariaDB &amp; Deep-Linked PMA
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Create databases, users, and grants. 1-click SSO directly into phpMyAdmin tables
                  with system schemas hidden, plus instant <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">.sql.gz</code> dump export and in-place restore.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#6494AC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Single Sign-On into schemas
                </div>
              </div>

              {/* Card 5: Pure-FTPd Accounts */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#886351] text-[#FAAA93]">
                  <HardDrive className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Pure-FTPd Account Management
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Provision FTP users jailed to specific site directories. Secure SHA-512 passwords,
                  instant reload via <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">pure-pw mkdb</code>, and zero config file tampering.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#886351]/15 px-2.5 py-0.5 text-xs font-semibold text-[#886351]">
                  Jailed site paths
                </div>
              </div>

              {/* Card 6: Hostinger-Style File Manager */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74B8CC] text-[#235361]">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Browser File Explorer &amp; Code Editor
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Tree file browser, in-browser syntax highlighted editor, octal chmod permissions,
                  archive compression/extraction (.zip and .tar.gz), and symlink traversal sandboxing.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Sandboxed path traversal check
                </div>
              </div>
            </div>
          )}

          {/* Category 4: Data, Backups & Security */}
          {activeCategory === "security" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Dual Mode Zip Backups */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAAA93] text-[#14242B]">
                  <Archive className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Dual-Mode .zip Backups
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Cross-platform zip backups for sites and databases. Download locally to your PC for
                  cold storage or keep on server for 1-click in-place restoration, with rclone &amp; Telegram sync.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FAAA93]/20 px-2.5 py-0.5 text-xs font-bold text-[#14242B]">
                  Local PC + Server restore
                </div>
              </div>

              {/* Card 2: 1-Click Panel SSL */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#74B8CC] text-[#235361]">
                  <Lock className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  1-Click Panel SSL (IP SANs)
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Enable immediate TLS on port 2083 using Self-Signed certificates with IP SANs
                  (for accessing via raw server IP without warning) or Let&apos;s Encrypt for custom domains.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Automated Nginx SSL reverse proxy
                </div>
              </div>

              {/* Card 3: 2FA TOTP */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-[#74B8CC]">
                  <Key className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Enterprise 2FA TOTP Protection
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Native RFC 6238 TOTP authenticator support (Google Authenticator, Authy, 1Password)
                  with high-res dynamic SVG QR codes and 8 emergency cryptographic recovery codes.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#235361]/10 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  RFC 6238 TOTP + 8 Recovery Keys
                </div>
              </div>

              {/* Card 4: UFW & Fail2ban */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6494AC] text-white">
                  <Flame className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Integrated Host Firewall &amp; Fail2ban
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Manage UFW rules, inspect Fail2ban jails, view banned brute-force IPs, and unban
                  with a single click directly from the dashboard security tab.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#6494AC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  UFW + Fail2ban Jails
                </div>
              </div>

              {/* Card 5: ModSecurity CRS */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#886351] text-[#FAAA93]">
                  <Shield className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  ModSecurity + OWASP CRS WAF
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Enterprise Web Application Firewall inspection. Detect and mitigate SQL injection,
                  cross-site scripting, and exploit probes with per-site WAF enforcement toggles.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#886351]/15 px-2.5 py-0.5 text-xs font-semibold text-[#886351]">
                  OWASP Core Rule Set
                </div>
              </div>

              {/* Card 6: JSONL Audit Log */}
              <div className="uni-card p-6 sm:p-7">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#235361] text-white">
                  <FileCode className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-[#14242B]">
                  Permanent JSONL Audit Trail
                </h3>
                <p className="mt-2 text-sm text-[#566E76] leading-relaxed">
                  Every privileged mutation is appended to an immutable JSONL audit file with timestamp,
                  action, typed parameters, and status outcome for total compliance transparency.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#235361]/10 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                  Audit trail on every mutation
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
