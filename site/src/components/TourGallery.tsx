"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Globe,
  Database,
  Mail,
  FolderTree,
  Terminal,
  Shield,
  Bot,
  Clock,
  ArrowRight,
  Check,
  LayoutGrid,
  Server,
} from "lucide-react";

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
      id: "sites",
      label: "Websites & PHP",
      icon: Globe,
      title: "Nginx Vhosts, Multi-PHP & Extensions",
      desc: "Deploy websites in seconds with isolated PHP-FPM sockets (8.1, 8.2, 8.3, 8.4). 1-click toggle PHP extensions (redis, imagick, opcache) and visually edit php.ini memory limits.",
      highlights: ["Zero Docker overhead", "1-Click Let's Encrypt & Wildcard SSL", "Visual php.ini & extension manager"],
    },
    {
      id: "appstore",
      label: "App Store",
      icon: LayoutGrid,
      title: "1-Click Docker Compose Stacks",
      desc: "Deploy curated production applications with isolated Docker Compose stacks: Ghost, Plausible Analytics, Umami, n8n automation, MinIO S3 object storage, and Vaultwarden with automatic Nginx reverse proxying.",
      highlights: ["Pre-configured Compose stacks", "Automated reverse proxy & SSL", "Real-time container log streaming"],
    },
    {
      id: "fleet",
      label: "Fleet Clusters",
      icon: Server,
      title: "Multi-Server Management & Clusters",
      desc: "Manage multiple Linux servers from one unified deck. Register remote agent nodes with token authentication, monitor cluster health, and seamlessly switch contexts across servers.",
      highlights: ["Unified multi-node dashboard", "Live node latency & ping checks", "Centralized cluster oversight"],
    },
    {
      id: "ai",
      label: "Developer AI",
      icon: Bot,
      title: "Coding Agents & Site Diagnostics",
      desc: "Native orchestration for Claude Code, OpenAI Codex, Antigravity, OpenCode, Aider, Ollama (offline local models), Goose, and Hermes. Real-time 0-100 Site Doctor health scoring with 1-click remediation.",
      highlights: ["Terminal agent launcher", "0-100 health diagnostics", "1-Click autonomous remediation"],
    },
    {
      id: "cron",
      label: "Cron Tasks",
      icon: Clock,
      title: "Visual Cron Job Manager",
      desc: "Schedule automated tasks with human presets (every minute, hourly, daily, weekly, monthly) or standard crontab syntax. Test runs with 1-click and inspect output in real time.",
      highlights: ["Visual recurrence presets", "1-Click Run-Now testing", "Execution logs & failure alerts"],
    },
    {
      id: "db",
      label: "Databases & PMA",
      icon: Database,
      title: "MariaDB & Deep-Linked phpMyAdmin",
      desc: "Provision databases, users, and grants. Launch directly into any database schema inside phpMyAdmin with one click without re-authenticating.",
      highlights: ["System schemas protected", "1-Click .sql and .sql.gz exports", "In-place database restores"],
    },
    {
      id: "mail",
      label: "Mail & PowerDNS",
      icon: Mail,
      title: "Production Postfix & Dovecot Suite",
      desc: "Manage email domains, mailboxes, virtual aliases, and sieve autoresponders. Automatically publish DKIM RSA-2048 keys and SPF/DMARC records into PowerDNS.",
      highlights: ["Authoritative SQLite PowerDNS", "Automated RSA-2048 DKIM keys", "SHA-512 crypt passwords"],
    },
    {
      id: "files",
      label: "File Manager",
      icon: FolderTree,
      title: "Tree Explorer & Code Editor",
      desc: "Tree explorer, syntax-highlighted code editor for instant fixes, octal chmod permissions, and sandboxed archive tools (.zip / .tar.gz).",
      highlights: ["Multi-file upload", "Path traversal protection", "Safe archive extraction"],
    },
    {
      id: "sec",
      label: "Security & 2FA",
      icon: Shield,
      title: "Web Terminal & Encrypted Key Vault",
      desc: "Browser terminal connected to native system PTY with synchronized sudo rights and automatic key injection. Enterprise RFC 6238 TOTP authenticator protection with 8 recovery keys.",
      highlights: ["Encrypted 0600 key vault", "UFW & Fail2ban unban", "Dynamic SVG QR codes"],
    },
  ];

  const current = tours[activeTour];
  const Icon = current.icon;

  return (
    <section id="features" className="border-t border-white/5 bg-[#0C121A] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>Feature Tour</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Everything your server needs, under one deck
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            From coexisting PHP sockets and production email to 1-click Docker Compose apps, multi-server fleet management, and automated backups.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-8 flex overflow-x-auto pb-2 justify-start sm:justify-center gap-1.5">
          {tours.map((tour, idx) => {
            const TourIcon = tour.icon;
            const isActive = activeTour === idx;
            return (
              <button
                key={tour.id}
                type="button"
                onClick={() => setActiveTour(idx)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "bg-[#18232F] text-[#F4F8FA] border border-white/10 shadow-sm"
                    : "border border-transparent text-[#8FA6B5] hover:text-[#F4F8FA] hover:bg-white/5"
                }`}
              >
                <TourIcon className="h-3.5 w-3.5 text-[#74B8CC]" />
                <span>{tour.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tour Detail Card */}
        <div className="mt-6 rounded-xl border border-white/10 bg-[#101720] p-6 sm:p-8 shadow-subtle">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#F4F8FA]">
                    {current.title}
                  </h3>
                  <span className="text-xs font-mono text-[#8FA6B5]">
                    CloudDeck Core Subsystem
                  </span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                {current.desc}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                {current.highlights.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono text-[#F4F8FA]"
                  >
                    <Check className="h-3 w-3 text-[#10B981]" />
                    <span>{h}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center justify-center rounded-lg border border-white/10 bg-[#0E151E] p-5 text-center sm:min-w-[240px]">
              <div className="text-[11px] font-mono text-[#8FA6B5]">
                Idle Footprint
              </div>
              <div className="mt-1 text-3xl font-semibold font-mono text-[#10B981] tabular-nums">
                &lt; 50 MB
              </div>
              <div className="mt-1 text-xs text-[#8FA6B5] font-mono">
                Go Stdlib + Next.js 16
              </div>
              <a
                href="#install"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-4 py-2 text-xs font-semibold text-[#0A0E13] hover:bg-[#85c6d8] transition"
              >
                <span>Deploy on Server</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
