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
  CheckCircle2,
} from "lucide-react";

export function BentoGrid() {
  const [activeCategory, setActiveCategory] = useState<"arch" | "ai" | "hosting" | "security">("arch");

  return (
    <section id="under-the-hood" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-semibold text-[#38BDF8]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>SYSTEM ARCHITECTURE &bull; v0.6.53</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Engineered for <span className="text-[#38BDF8]">performance</span>, not bloat.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            A radical departure from 1990s legacy control panels. Explore the modern foundations,
            autonomous AI agents, and bare-metal runtime engine powering CloudDeck.
          </p>
        </div>

        {/* Category Pill Switcher */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-2xl sm:rounded-full border border-white/10 bg-[#0C121A] p-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => setActiveCategory("arch")}
              className={`rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "arch"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Architecture &amp; Core
            </button>
            <button
              type="button"
              id="ai-agents"
              onClick={() => setActiveCategory("ai")}
              className={`flex items-center gap-1.5 rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "ai"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI Agents &amp; Autonomy</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("hosting")}
              className={`rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "hosting"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Hosting &amp; Runtimes
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("security")}
              className={`rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeCategory === "security"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
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
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Zero-Root Web Layer
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    The Next.js 16 panel runs as an unprivileged user (<code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">clouddeck</code>).
                    A privileged Go daemon listens strictly on <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">127.0.0.1:9090</code>.
                    No browser request ever executes shell strings (<code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-rose-400">no sh -c</code>).
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#10B981] w-fit">
                  Typed argument arrays only
                </div>
              </div>

              {/* Card 2: Ultra-low RAM */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    &lt;50 MB Idle Memory
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    cPanel consumes 1.5GB+ RAM just idling. CloudDeck runs effortlessly on a $3.50/mo
                    1-vCPU 1GB RAM cloud VPS, saving you hundreds of dollars in unnecessary infrastructure costs.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#10B981] w-fit">
                  30x lighter than cPanel
                </div>
              </div>

              {/* Card 3: Local Dev Suite */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6366F1]/10 border border-[#6366F1]/20 text-[#818CF8]">
                    <Server className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Local Dev Suite (XAMPP Alt)
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Turn Windows 10/11 (WSL 2) and macOS into a modern LEMP workstation with Nginx
                    production parity, multi-PHP coexistence, and automated Root CA green padlocks on <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">*.local</code>.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#818CF8]/20 bg-[#6366F1]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#818CF8] w-fit">
                  Windows PATH &bull; macOS brew
                </div>
              </div>

              {/* Card 4: Web Terminal */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Web Terminal PTY
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Full xterm.js terminal running directly inside your browser. Synchronized credentials
                    allow instant elevation with <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">sudo -i</code> without leaving the dashboard.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-amber-400 w-fit">
                  PTY Unix socket streaming
                </div>
              </div>

              {/* Card 5: PowerDNS */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Globe className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    PowerDNS Authoritative
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Built-in SQLite-backed nameserver. Manage A, AAAA, CNAME, MX, TXT, SRV, and CAA
                    records with 1-click automated publishing for mail and DKIM records.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#38BDF8] w-fit">
                  Port 53 Native DNS
                </div>
              </div>

              {/* Card 6: 100% Go Stdlib Agent */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <FileCode className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Zero 3rd-Party Go Dependencies
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    The Go agent daemon relies strictly on the Go standard library. No bloated dependency
                    trees, zero supply chain attack vectors, and instant single-binary execution.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-emerald-400 w-fit">
                  Static binary &bull; stdlib only
                </div>
              </div>
            </div>
          )}

          {/* Category 2: AI Agents & Autonomy */}
          {activeCategory === "ai" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: 8 Native AI Coding Agents */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    8 Native AI Coding Agents
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Inspect, manage, and launch 8 developer AI agents: Claude Code, OpenAI Codex, Google Antigravity,
                    OpenCode, Aider, Ollama (local offline models), Goose, and Hermes Agent directly in your browser terminal.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#38BDF8] w-fit">
                  Claude &bull; Codex &bull; Ollama &bull; Hermes
                </div>
              </div>

              {/* Card 2: Autonomous Site Doctor & Auto-Fix */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Site Doctor &amp; 1-Click Auto-Fix
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Real-time 0–100 health scoring across Nginx configs, SSL expiration, DNS propagation,
                    database connectivity, and file permissions. Fix detected defects with a single click.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#10B981] w-fit">
                  0-100 Score &bull; Autonomous Fix
                </div>
              </div>

              {/* Card 3: Encrypted AI Key Vault */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#818CF8]/10 border border-[#818CF8]/20 text-[#818CF8]">
                    <Key className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    AI Key Vault &bull; Auto-Injection
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Store credentials for Anthropic, OpenAI, DeepSeek, Gemini, and Ollama in a protected
                    vault (<code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">mode 0600</code>).
                    Keys are automatically exported into shell sessions upon terminal launch.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#818CF8]/20 bg-[#6366F1]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#818CF8] w-fit">
                  Masked secrets &bull; Terminal injection
                </div>
              </div>

              {/* Card 4: Server AI Chat Drawer */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Global Server AI Chat Drawer
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Floating chat assistant available anywhere in the panel with live server context
                    (CPU, RAM, sites, systemd units, logs) and multi-tier failover across Anthropic, OpenAI, DeepSeek, and Ollama.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-cyan-400 w-fit">
                  Context-aware &bull; Multi-provider failover
                </div>
              </div>

              {/* Card 5: Visual Cron Job Manager */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Clock className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Visual Cron Job Scheduler
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    cPanel-style scheduled tasks manager with visual recurrence selector (every minute, hourly,
                    daily, weekly, monthly, or crontab syntax). Features 1-click &quot;Run Now&quot; testing and stdout logs.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-amber-400 w-fit">
                  Visual presets &bull; Run-Now testing
                </div>
              </div>

              {/* Card 6: PHP Extensions & Visual php.ini */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <Sliders className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    PHP Extensions &amp; php.ini Editor
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    1-click extension toggling and installation across all coexisting PHP versions (8.1, 8.2, 8.3, 8.4)
                    for redis, imagick, opcache, curl, and intl, with visual tuning of memory limits and execution times.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-purple-400 w-fit">
                  1-Click toggles &bull; Visual memory tuning
                </div>
              </div>
            </div>
          )}

          {/* Category 3: Hosting & Runtimes */}
          {activeCategory === "hosting" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Multi-PHP */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Multi-PHP Coexistence (8.1–8.4)
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Switch PHP versions per site with one click. CloudDeck manages isolated Unix domain
                    sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously on bare metal without Docker overhead.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#38BDF8] w-fit">
                  Nginx fastcgi_pass sockets
                </div>
              </div>

              {/* Card 2: Polyglot Apps */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#818CF8]/10 border border-[#818CF8]/20 text-[#818CF8]">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Polyglot App Supervision
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Run Node.js, Python, Go, Ruby, and custom apps. CloudDeck creates isolated systemd units,
                    allocates loopback ports, and sets up Nginx reverse proxying with live log streaming.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#818CF8]/20 bg-[#6366F1]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#818CF8] w-fit">
                  systemd + Nginx proxy
                </div>
              </div>

              {/* Card 3: Production Mail Server */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Production Postfix &amp; Dovecot
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Complete bare-metal email stack. Mailboxes with SHA-512 crypt passwords, quotas,
                    virtual aliases, sieve autoresponders, RSA-2048 DKIM, and automatic SPF/DMARC publishing.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-emerald-400 w-fit">
                  DKIM, SPF, DMARC 1-click
                </div>
              </div>

              {/* Card 4: MariaDB & phpMyAdmin */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Database className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    MariaDB &amp; Deep-Linked PMA
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Create databases, users, and grants. 1-click SSO directly into phpMyAdmin tables
                    with system schemas hidden, plus instant <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">.sql.gz</code> dump export and in-place restore.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#38BDF8] w-fit">
                  Single Sign-On into schemas
                </div>
              </div>

              {/* Card 5: Pure-FTPd Accounts */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Pure-FTPd Account Management
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Provision FTP users jailed to specific site directories. Secure SHA-512 passwords,
                    instant reload via <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">pure-pw mkdb</code>, and zero config file tampering.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-amber-400 w-fit">
                  Jailed site paths
                </div>
              </div>

              {/* Card 6: Hostinger-Style File Manager */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <FileCode className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Browser File Explorer &amp; Editor
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Tree file browser, in-browser syntax highlighted editor, octal chmod permissions,
                    archive compression/extraction (.zip and .tar.gz), and symlink traversal sandboxing.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-purple-400 w-fit">
                  Sandboxed path traversal check
                </div>
              </div>
            </div>
          )}

          {/* Category 4: Data, Backups & Security */}
          {activeCategory === "security" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Dual Mode Zip Backups */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Archive className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Dual-Mode .zip Backups
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Cross-platform zip backups for sites and databases. Download locally to your PC for
                    cold storage or keep on server for 1-click in-place restoration, with rclone &amp; Telegram sync.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#38BDF8] w-fit">
                  Local PC + Server restore
                </div>
              </div>

              {/* Card 2: 1-Click Panel SSL */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981]">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    1-Click Panel SSL (IP SANs)
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Enable immediate TLS on port 2083 using Self-Signed certificates with IP SANs
                    (for accessing via raw server IP without warning) or Let&apos;s Encrypt for custom domains.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#10B981] w-fit">
                  Automated Nginx SSL reverse proxy
                </div>
              </div>

              {/* Card 3: 2FA TOTP */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#818CF8]/10 border border-[#818CF8]/20 text-[#818CF8]">
                    <Key className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Enterprise 2FA TOTP Protection
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Native RFC 6238 TOTP authenticator support (Google Authenticator, Authy, 1Password)
                    with high-res dynamic SVG QR codes and 8 emergency cryptographic recovery codes.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#818CF8]/20 bg-[#6366F1]/10 px-2.5 py-0.5 text-xs font-mono font-medium text-[#818CF8] w-fit">
                  RFC 6238 TOTP + 8 Recovery Keys
                </div>
              </div>

              {/* Card 4: UFW & Fail2ban */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <Flame className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Integrated Firewall &amp; Fail2ban
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Manage UFW rules, inspect Fail2ban jails, view banned brute-force IPs, and unban
                    with a single click directly from the dashboard security tab.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-rose-400 w-fit">
                  UFW + Fail2ban Jails
                </div>
              </div>

              {/* Card 5: ModSecurity CRS */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    ModSecurity + OWASP CRS WAF
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Enterprise Web Application Firewall inspection. Detect and mitigate SQL injection,
                    cross-site scripting, and exploit probes with per-site WAF enforcement toggles.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-amber-400 w-fit">
                  OWASP Core Rule Set
                </div>
              </div>

              {/* Card 6: JSONL Audit Log */}
              <div className="deck-card p-6 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <FileCode className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    Permanent JSONL Audit Trail
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    Every privileged mutation is appended to an immutable JSONL audit file with timestamp,
                    action, typed parameters, and status outcome for total compliance transparency.
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-cyan-400 w-fit">
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
