"use client";

import { useState } from "react";
import { LayoutDashboard, Globe, Database, Mail, FolderTree, Terminal, Shield, Bot, Clock } from "lucide-react";

export function TourGallery() {
  const [activeTour, setActiveTour] = useState<number>(0);

  const tours = [
    {
      id: "dash",
      label: "Dashboard",
      icon: LayoutDashboard,
      title: "Real-time Host Deck & Metrics",
      desc: "Live CPU, RAM, and disk utilization metrics, active site counts, quick actions, and recent audit activity streamed directly without browser lag.",
      highlights: ["Under 50MB RAM idle", "Zero-root unprivileged web process", "Instant systemd service health"],
    },
    {
      id: "ai",
      label: "AI & Doctor",
      icon: Bot,
      title: "8 Coding Agents & Autonomous Site Doctor",
      desc: "Native orchestration for Claude Code, OpenAI Codex, Antigravity, OpenCode, Aider, Ollama (offline local models), Goose, and Hermes. Real-time 0-100 Site Doctor health scoring with 1-click autonomous Auto-Fix.",
      highlights: ["8 AI coding agents built-in", "0-100 Site Doctor health score", "1-Click autonomous auto-remediation"],
    },
    {
      id: "sites",
      label: "Websites & PHP",
      icon: Globe,
      title: "Nginx Vhosts, Multi-PHP & Extensions",
      desc: "Deploy websites in seconds with isolated PHP-FPM sockets (8.1, 8.2, 8.3, 8.4). 1-click toggle PHP extensions (redis, imagick, opcache) and visually edit php.ini memory limits.",
      highlights: ["Zero Docker virtualization overhead", "1-Click Let's Encrypt & Panel SSL", "Visual php.ini & extension manager"],
    },
    {
      id: "cron",
      label: "Cron Tasks",
      icon: Clock,
      title: "Visual Cron Job Manager",
      desc: "Schedule automated tasks with human presets (every minute, hourly, daily, weekly, monthly) or standard crontab syntax. Test runs with 1-click and inspect output in real time.",
      highlights: ["Visual recurrence presets", "1-Click Run-Now test execution", "Execution logs & failure alerts"],
    },
    {
      id: "db",
      label: "Databases & PMA",
      icon: Database,
      title: "MariaDB & Deep-Linked phpMyAdmin",
      desc: "Provision databases, users, and grants. Launch directly into any database schema inside phpMyAdmin with one click without re-authenticating.",
      highlights: ["System schemas hidden for safety", "1-Click .sql and .sql.gz exports", "In-place database restores"],
    },
    {
      id: "mail",
      label: "Mail & PowerDNS",
      icon: Mail,
      title: "Production Postfix & Dovecot Suite",
      desc: "Manage email domains, mailboxes, virtual aliases, and sieve autoresponders. Automatically publish DKIM RSA-2048 keys and SPF/DMARC records into PowerDNS.",
      highlights: ["Authoritative SQLite PowerDNS", "Automated RSA-2048 DKIM keys", "SHA-512 crypt mailbox passwords"],
    },
    {
      id: "files",
      label: "File Manager",
      icon: FolderTree,
      title: "Tree Explorer & Code Editor",
      desc: "Hostinger-style tree explorer, syntax-highlighted code editor for instant fixes, octal chmod permissions, and sandboxed archive tools (.zip / .tar.gz).",
      highlights: ["Drag & drop multi-file upload", "Path traversal protection", "Safe archive extraction"],
    },
    {
      id: "sec",
      label: "Terminal & 2FA",
      icon: Shield,
      title: "Web Terminal PTY & Encrypted Key Vault",
      desc: "Browser terminal connected to native system PTY with synchronized sudo rights and automatic AI key injection. Enterprise RFC 6238 TOTP authenticator protection with 8 recovery keys.",
      highlights: ["AI Key Vault auto-injection", "UFW & Fail2ban brute-force unban", "Dynamic SVG QR codes"],
    },
  ];

  const current = tours[activeTour];
  const Icon = current.icon;

  return (
    <section id="features" className="border-t border-[#D2ADAC]/40 bg-[#FAF7F5] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#886351]">
            <span>Interactive Feature Tour &bull; v0.6.53</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Everything your server needs, <span className="text-[#235361]">under one deck</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            From coexisting PHP sockets and production email to autonomous AI coding agents and 1-click backups.
          </p>
        </div>

        {/* Feature Navigation Pills */}
        <div className="mt-10 flex overflow-x-auto pb-2 justify-start sm:justify-center gap-2">
          {tours.map((tour, idx) => {
            const TourIcon = tour.icon;
            const isActive = activeTour === idx;
            return (
              <button
                key={tour.id}
                type="button"
                onClick={() => setActiveTour(idx)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                  isActive
                    ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                    : "border border-[#D2ADAC]/60 bg-white/80 text-[#566E76] hover:bg-white hover:text-[#14242B]"
                }`}
              >
                <TourIcon className="h-3.5 w-3.5" />
                <span>{tour.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tour Detail Card */}
        <div className="mt-8 rounded-3xl border border-[#D2ADAC]/60 bg-white p-6 sm:p-10 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#235361] text-[#74B8CC]">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#14242B] sm:text-2xl">
                    {current.title}
                  </h3>
                  <span className="text-xs font-semibold text-[#886351]">
                    CloudDeck Core Module
                  </span>
                </div>
              </div>

              <p className="text-sm text-[#566E76] sm:text-base leading-relaxed">
                {current.desc}
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {current.highlights.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-[#74B8CC]/15 px-3 py-1 text-xs font-semibold text-[#235361]"
                  >
                    ✓ {h}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-[#D2ADAC]/40 bg-[#FAF7F5] p-6 text-center sm:min-w-[280px]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#886351]">
                Idle Footprint
              </div>
              <div className="mt-2 text-4xl font-extrabold text-[#235361]">
                &lt;50 MB
              </div>
              <div className="mt-1 text-xs text-[#38BD87] font-semibold">
                Go Stdlib + Next.js 16
              </div>
              <a
                href="#install"
                className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-[#FAAA93] px-5 py-2 text-xs font-bold text-[#14242B] shadow-xs transition hover:bg-[#fa9e85]"
              >
                <span>Deploy on Server</span>
                <span>&rarr;</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
