"use client";

import { useState } from "react";
import { LayoutDashboard, Globe, Database, Mail, FolderTree, Terminal, Shield } from "lucide-react";

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
      title: "Nginx Vhosts & Multi-PHP Coexistence",
      desc: "Deploy websites in seconds with isolated PHP-FPM sockets (8.1, 8.2, 8.3, 8.4). Manage custom domains, subdomains, SSL certificates, and redirects.",
      highlights: ["Zero Docker virtualization overhead", "1-Click Let's Encrypt & Panel SSL", "Real-time access log viewer"],
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
      title: "Web Terminal PTY & 2FA TOTP",
      desc: "Browser terminal connected to native system PTY with synchronized sudo rights. Enterprise RFC 6238 TOTP authenticator protection with 8 emergency backup keys.",
      highlights: ["UFW firewall management", "Fail2ban brute-force unban", "Dynamic SVG QR codes"],
    },
  ];

  const current = tours[activeTour];

  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#886351]">
            <span>Feature Tour</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Everything you need. <span className="text-[#235361]">Nothing you don&apos;t.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            A complete, integrated hosting and local development platform without the clutter or licensing fees of legacy panels.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="mt-10 flex overflow-x-auto pb-2 justify-start sm:justify-center">
          <div className="flex gap-2 rounded-full border border-[#D2ADAC]/60 bg-white/80 p-1 shadow-xs">
            {tours.map((t, idx) => {
              const Icon = t.icon;
              const isActive = activeTour === idx;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTour(idx)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition whitespace-nowrap ${
                    isActive
                      ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                      : "text-[#566E76] hover:text-[#14242B]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tour Detail Card */}
        <div className="mt-8 rounded-3xl border border-[#D2ADAC]/60 bg-white p-6 shadow-xl sm:p-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#74B8CC]/15 px-3 py-1 text-xs font-semibold text-[#235361]">
                <span>CloudDeck Interface</span>
              </div>
              <h3 className="mt-4 text-2xl font-bold text-[#14242B] sm:text-3xl">
                {current.title}
              </h3>
              <p className="mt-4 text-sm text-[#566E76] leading-relaxed sm:text-base">
                {current.desc}
              </p>

              <div className="mt-6 space-y-2.5">
                {current.highlights.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#235361]">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#38BD87]/15 text-[#38BD87]">
                      ✓
                    </div>
                    <span>{h}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <a
                  href="#install"
                  className="inline-flex items-center gap-2 rounded-full bg-[#235361] px-5 py-2.5 text-xs font-bold text-[#74B8CC] transition hover:bg-[#183a44]"
                >
                  <span>Deploy on Your VPS</span>
                  <span>→</span>
                </a>
              </div>
            </div>

            {/* Visual Panel Mockup Preview */}
            <div className="overflow-hidden rounded-2xl border border-[#D2ADAC]/60 bg-[#122228] p-5 text-white shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-[#9BB2BA]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                  <span className="ml-2 font-mono text-[11px] text-[#74B8CC]">clouddeck/{current.id}</span>
                </div>
                <span className="rounded bg-[#235361] px-2 py-0.5 text-[10px] text-[#74B8CC]">Live Preview</span>
              </div>

              <div className="mt-5 space-y-3 font-mono text-xs">
                <div className="rounded-lg bg-[#0C171C] p-3 text-[#38BD87]">
                  [STATUS] Module: {current.title}
                </div>
                <div className="rounded-lg bg-[#0C171C] p-3 text-[#9BB2BA]">
                  &gt; Active process: unprivileged clouddeck UI (Port 2083)<br />
                  &gt; Agent daemon: 127.0.0.1:9090 (Token verified)<br />
                  &gt; Architecture: Typed argv execution (Safeexec)
                </div>
                <div className="rounded-lg bg-[#182D35] p-3 text-[#FAAA93]">
                  All operations recorded in audit.jsonl with cryptographic checksums.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

