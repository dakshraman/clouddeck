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
  FileCode,
  Zap,
  Bot,
  Stethoscope,
  Clock,
  Sliders,
  MessageSquare,
  Flame,
} from "lucide-react";

export function BentoGrid() {
  const [activeCategory, setActiveCategory] = useState<"arch" | "ai" | "hosting" | "security">("arch");

  return (
    <section id="architecture" className="py-16 sm:py-20 relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>System Architecture</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Engineered for performance, not legacy bloat
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            A departure from 1990s legacy control panels. Explore the foundations,
            bare-metal runtime engine, and security separation powering CloudDeck.
          </p>
        </div>

        {/* Category Segmented Switcher */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-lg border border-white/10 bg-[#101720] p-1 shadow-subtle">
            <button
              type="button"
              onClick={() => setActiveCategory("arch")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeCategory === "arch"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Architecture &amp; Core
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("ai")}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeCategory === "ai"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI Agents &amp; Tooling</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("hosting")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeCategory === "hosting"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Hosting &amp; Runtimes
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("security")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                activeCategory === "security"
                  ? "bg-[#18232F] text-[#F4F8FA] shadow-sm border border-white/10"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              Data, Backups &amp; Security
            </button>
          </div>
        </div>

        {/* Dynamic Bento Cards */}
        <div className="mt-10">
          {/* Category 1: Architecture & Core */}
          {activeCategory === "arch" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Zero Root */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Shield className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Zero-Root Web Layer
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    The Next.js 16 panel runs as an unprivileged user (<code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">clouddeck</code>).
                    The privileged Go daemon listens strictly on <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">127.0.0.1:9090</code>.
                    No browser request can ever execute shell strings.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Typed argument arrays only
                </div>
              </div>

              {/* Card 2: Ultra-low RAM */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Under 50MB Idle Memory
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    cPanel consumes 1.5GB+ RAM just idling. CloudDeck runs effortlessly on a standard
                    1-vCPU 1GB RAM cloud VPS, eliminating unnecessary hosting overhead.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Lightweight Go stdlib core
                </div>
              </div>

              {/* Card 3: Local Dev Suite */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Server className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Local Workstation Suite
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Turns Windows 10/11 (WSL 2) and macOS into an authentic LEMP workstation with Nginx
                    production parity, multi-PHP coexistence, and automated Local Root CA padlocks on <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">*.local</code>.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Windows PATH / macOS brew
                </div>
              </div>

              {/* Card 4: Web Terminal */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    In-Browser Terminal (PTY)
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Interactive xterm.js terminal connected directly to native system PTY sessions over
                    authenticated WebSockets with elevation rights and audit tracking.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  PTY streaming / xterm.js
                </div>
              </div>

              {/* Card 5: PowerDNS */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Globe className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Authoritative PowerDNS
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Integrated SQLite-backed nameserver. Manage A, AAAA, CNAME, MX, TXT, and CAA
                    records with automated publishing for mail, SPF, and DKIM.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Port 53 authoritative DNS
                </div>
              </div>

              {/* Card 6: 100% Go Stdlib Agent */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Zero 3rd-Party Go Dependencies
                  </h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                    The Go agent daemon relies strictly on Go 1.23 standard library packages. No bloated dependency
                    trees, zero supply chain attack vectors, and instant single-binary execution.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Static binary / stdlib only
                </div>
              </div>
            </div>
          )}

          {/* Category 2: AI Agents & Tooling */}
          {activeCategory === "ai" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: 8 Native AI Coding Agents */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Bot className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Developer Agent Orchestration
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Inspect, manage, and launch coding assistants directly in your server terminal:
                    Claude Code, OpenAI Codex, Antigravity, OpenCode, Aider, Ollama, Goose, and Hermes.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Local &amp; cloud CLI agents
                </div>
              </div>

              {/* Card 2: Autonomous Site Doctor */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Stethoscope className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Site Doctor Diagnostics
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Automated 0–100 health scoring across Nginx configs, SSL expiration, DNS propagation,
                    database connectivity, and file permissions, with 1-click remediation.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  0-100 Score / Auto-Fix
                </div>
              </div>

              {/* Card 3: Encrypted AI Key Vault */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Key className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Encrypted Credential Vault
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Store API credentials in a protected root vault (<code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">mode 0600</code>).
                    Keys are masked in the browser and injected safely into terminal sessions.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  0600 root permissions
                </div>
              </div>

              {/* Card 4: Server AI Chat Drawer */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Context-Aware Assistant Drawer
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Chat assistant accessible across the panel with real-time server telemetry
                    (CPU, RAM, sites, systemd units, logs) and multi-provider failover.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Context-aware telemetry
                </div>
              </div>

              {/* Card 5: Visual Cron Job Manager */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Visual Cron Scheduler
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Scheduled tasks manager with human presets (every minute, hourly, daily, weekly, monthly)
                    and standard crontab syntax, with 1-click test runs and output logs.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Crontab / Run-Now testing
                </div>
              </div>

              {/* Card 6: PHP Extensions & Visual php.ini */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Visual php.ini &amp; Extensions
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    1-click extension management across all PHP versions (8.1, 8.2, 8.3, 8.4)
                    for redis, imagick, opcache, and intl, with visual tuning of memory limits.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Visual memory limits &amp; opcache
                </div>
              </div>
            </div>
          )}

          {/* Category 3: Hosting & Runtimes */}
          {activeCategory === "hosting" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Multi-PHP */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Zap className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Multi-PHP Coexistence (8.1–8.4)
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Switch PHP versions per site with one click. CloudDeck manages isolated Unix domain
                    sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously on bare metal without Docker overhead.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Nginx fastcgi_pass sockets
                </div>
              </div>

              {/* Card 2: Polyglot Apps */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Layers className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Polyglot App Supervision
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Run Node.js, Python, Go, and Ruby services. CloudDeck creates isolated systemd units,
                    allocates loopback ports, and configures reverse proxies with live logs.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  systemd + Nginx proxy
                </div>
              </div>

              {/* Card 3: Production Mail Server */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Production Postfix &amp; Dovecot
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Complete email stack with SHA-512 crypt mailboxes, quotas, virtual aliases,
                    sieve autoresponders, RSA-2048 DKIM signing, and automatic SPF/DMARC records.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  DKIM, SPF, DMARC 1-click
                </div>
              </div>

              {/* Card 4: MariaDB & phpMyAdmin */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Database className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    MariaDB &amp; Deep-Linked PMA
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Create databases, users, and grants. 1-click SSO directly into phpMyAdmin tables
                    with system schemas hidden, plus instant <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">.sql.gz</code> dumps.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Single Sign-On into schemas
                </div>
              </div>

              {/* Card 5: Pure-FTPd Accounts */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Pure-FTPd Accounts
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Provision FTP users jailed to specific site directories. Secure SHA-512 passwords,
                    instant reload via <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">pure-pw mkdb</code>, and zero config tampering.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Jailed site paths
                </div>
              </div>

              {/* Card 6: File Manager */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    File Explorer &amp; Code Editor
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Tree file browser, in-browser editor, octal chmod permissions,
                    archive compression/extraction (.zip and .tar.gz), and symlink traversal sandboxing.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Path traversal protected
                </div>
              </div>
            </div>
          )}

          {/* Category 4: Data, Backups & Security */}
          {activeCategory === "security" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Card 1: Dual Mode Zip Backups */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Archive className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Dual-Mode .zip Backups
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Cross-platform zip backups for sites and databases. Download locally to your PC for
                    cold storage or keep on server for 1-click in-place restoration, with rclone &amp; Telegram sync.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Local PC + Server restore
                </div>
              </div>

              {/* Card 2: 1-Click Panel SSL */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    1-Click Panel SSL (IP SANs)
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Enable immediate TLS on port 2083 using Self-Signed certificates with IP SANs
                    (for accessing via raw server IP without warning) or Let&apos;s Encrypt for custom domains.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  Automated Nginx SSL reverse proxy
                </div>
              </div>

              {/* Card 3: 2FA TOTP */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Key className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Enterprise 2FA TOTP Protection
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Native RFC 6238 TOTP authenticator support (Google Authenticator, Authy, 1Password)
                    with high-resolution SVG QR codes and 8 emergency cryptographic recovery codes.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  RFC 6238 TOTP + 8 Recovery Keys
                </div>
              </div>

              {/* Card 4: UFW & Fail2ban */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Flame className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Integrated Firewall &amp; Fail2ban
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Manage UFW rules, inspect Fail2ban jails, view banned brute-force IPs, and unban
                    with a single click directly from the dashboard security tab.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  UFW + Fail2ban Jails
                </div>
              </div>

              {/* Card 5: ModSecurity CRS */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Shield className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    ModSecurity + OWASP CRS WAF
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Enterprise Web Application Firewall inspection. Detect and mitigate SQL injection,
                    cross-site scripting, and exploit probes with per-site WAF enforcement toggles.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
                  OWASP Core Rule Set
                </div>
              </div>

              {/* Card 6: JSONL Audit Log */}
              <div className="deck-card p-5 sm:p-6 flex flex-col justify-between">
                <div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold text-[#F4F8FA]">
                    Permanent JSONL Audit Trail
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                    Every privileged mutation is appended to an immutable JSONL audit file with timestamp,
                    action, typed parameters, and status outcome for total compliance transparency.
                  </p>
                </div>
                <div className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-[#8FA6B5] w-fit">
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
