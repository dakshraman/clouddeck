"use client";

import { useState } from "react";
import {
  Globe,
  LayoutGrid,
  Server,
  Bot,
  Database,
  Shield,
  GitBranch,
  ArrowRight,
  Check,
  RefreshCw,
  Cpu,
  Mail,
  Zap,
  RotateCcw,
} from "lucide-react";

interface Subsystem {
  id: string;
  tag: string;
  label: string;
  icon: typeof Globe;
  title: string;
  description: string;
  cliCommand: string;
  specs: { label: string; value: string }[];
  highlights: string[];
}

export function TourGallery() {
  const [activeTab, setActiveTab] = useState<string>("sites");
  const [selectedPhp, setSelectedPhp] = useState<string>("8.4");
  const [activeFleetNode, setActiveFleetNode] = useState<string>("lon-01");
  const [doctorDiagnosing, setDoctorDiagnosing] = useState<boolean>(false);
  const [doctorScore, setDoctorScore] = useState<number>(98);
  const [rollbackSuccess, setRollbackSuccess] = useState<boolean>(false);

  const subsystems: Subsystem[] = [
    {
      id: "sites",
      tag: "Runtime",
      label: "Websites & PHP",
      icon: Globe,
      title: "Coexisting multi-PHP and Nginx virtual hosts",
      description:
        "Dedicated Unix domain sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously. Direct FastCGI routing delivers sub-millisecond execution with zero Docker virtualization latency.",
      cliCommand: "clouddeck sites list --runtime=php",
      specs: [
        { label: "Execution latency", value: "< 0.18ms kernel socket" },
        { label: "Pool footprint", value: "~14 MB per version" },
        { label: "SSL automation", value: "Let's Encrypt + Wildcard" },
        { label: "Opcache tuning", value: "1-click visual toggles" },
      ],
      highlights: [
        "Zero container overhead: bare-metal Linux performance",
        "Isolated Unix domain sockets per PHP version",
        "Visual php.ini memory limits and execution timeouts",
        "Automated HTTPS with auto-renewing ACME certificates",
      ],
    },
    {
      id: "appstore",
      tag: "Applications",
      label: "App store & Compose",
      icon: LayoutGrid,
      title: "1-click stacks and custom Docker Compose",
      description:
        "Deploy production services or paste arbitrary multi-container docker-compose.yml files. CloudDeck isolates containers, injects non-conflicting ports, and auto-configures Nginx reverse proxying with TLS termination.",
      cliCommand: "clouddeck appstore list && clouddeck apps status",
      specs: [
        { label: "Curated catalog", value: "Redis, Mongo, Ghost, n8n, MinIO" },
        { label: "Custom ingestion", value: "Arbitrary docker-compose.yml" },
        { label: "Reverse proxying", value: "Automated Nginx upstream" },
        { label: "Log streaming", value: "Live stdout/stderr stream" },
      ],
      highlights: [
        "Curated 1-click catalog (Redis, MongoDB, Ghost, MinIO, PocketBase)",
        "Paste custom compose YAML with auto-detected service ports",
        "Auto-configured Nginx reverse proxy to external domains",
        "Zero manual port conflicts with intelligent allocation",
      ],
    },
    {
      id: "ai",
      tag: "Diagnostics",
      label: "Site Doctor & AI",
      icon: Bot,
      title: "Autonomous Site Doctor and coding agents",
      description:
        "Launch native coding agents (Claude Code, OpenAI Codex, Antigravity, Ollama, Hermes) directly in your server terminal. The autonomous Site Doctor runs deep system diagnostics with 1-click repair.",
      cliCommand: "clouddeck doctor --fix",
      specs: [
        { label: "Integrated agents", value: "Claude, Codex, Ollama, Hermes" },
        { label: "Diagnostic scoring", value: "0–100 system health index" },
        { label: "Remediation", value: "Autonomous 1-click auto-fix" },
        { label: "Offline inference", value: "Direct Ollama local API" },
      ],
      highlights: [
        "Native coding agent orchestrations inside web terminal",
        "Autonomous Site Doctor diagnostics covering Nginx, PHP, MariaDB",
        "1-click remediation for masked units, permissions, and socket locks",
        "Offline local AI capability via local Ollama models",
      ],
    },
    {
      id: "fleet",
      tag: "Infrastructure",
      label: "Fleet multi-server",
      icon: Server,
      title: "Unified cluster mesh and node health",
      description:
        "Oversee multiple Linux servers across Hetzner, AWS, DigitalOcean, or on-premise hardware from one panel. Secure token handshakes stream node heartbeats, latency pings, and resource graphs.",
      cliCommand: "clouddeck fleet status --all-nodes",
      specs: [
        { label: "Node heartbeat", value: "15s interval via TLS" },
        { label: "Cluster mesh", value: "Zero master bottlenecks" },
        { label: "Cross-server auth", value: "Ed25519 node tokens" },
        { label: "Context switch", value: "Instant 0-downtime switch" },
      ],
      highlights: [
        "Single-deck control across distributed global server fleets",
        "Live round-trip latency pings and hardware load metrics",
        "Seamless context switching between local and remote agents",
        "Centralized configuration rollback and health oversight",
      ],
    },
    {
      id: "git",
      tag: "Deployment",
      label: "Git CI/CD & rollback",
      icon: GitBranch,
      title: "Zero-downtime releases and atomic rollback",
      description:
        "Deploy directly from GitHub or GitLab. Every deployment creates an immutable release directory, runs build scripts, and switches the Nginx symlink atomically with 1-click instant rollback.",
      cliCommand: "clouddeck git deploy && clouddeck git rollback",
      specs: [
        { label: "Deployment strategy", value: "Atomic symlink swap" },
        { label: "Rollback latency", value: "< 10ms zero-downtime" },
        { label: "Webhook integration", value: "GitHub / GitLab push hooks" },
        { label: "Release history", value: "Keep last 5 releases with logs" },
      ],
      highlights: [
        "Zero-downtime deployments via atomic symlink directory swapping",
        "1-click rollback to any previous release commit",
        "Copyable webhook deploy URLs for GitHub Actions and GitLab CI",
        "Full stdout/stderr build logs captured for every deployment",
      ],
    },
    {
      id: "sec",
      tag: "Security",
      label: "Mail, DNS & security",
      icon: Shield,
      title: "PowerDNS, Postfix, and 2FA hardening",
      description:
        "Built-in authoritative SQLite PowerDNS, production Postfix/Dovecot with automated RSA-2048 DKIM, hardware-level UFW firewall controls, and enterprise RFC 6238 TOTP two-factor authentication.",
      cliCommand: "clouddeck security audit --firewall --auth",
      specs: [
        { label: "DNS nameserver", value: "Authoritative PowerDNS" },
        { label: "Mail encryption", value: "RSA-2048 DKIM & SPF/DMARC" },
        { label: "2FA protection", value: "RFC 6238 TOTP + 8 recovery codes" },
        { label: "Intrusion guard", value: "Fail2ban integration & UFW" },
      ],
      highlights: [
        "Authoritative PowerDNS server with automated DKIM record sync",
        "Complete Postfix & Dovecot mail stack with SHA-512 crypt storage",
        "Enterprise two-factor authentication (TOTP) with backup tokens",
        "Native UFW firewall rule orchestration and Fail2ban unban tools",
      ],
    },
  ];

  const current = subsystems.find((s) => s.id === activeTab) || subsystems[0];

  const handleRunDoctor = () => {
    setDoctorDiagnosing(true);
    setTimeout(() => {
      setDoctorDiagnosing(false);
      setDoctorScore(100);
    }, 750);
  };

  const handleRollback = () => {
    setRollbackSuccess(true);
    setTimeout(() => {
      setRollbackSuccess(false);
    }, 2500);
  };

  return (
    <section id="tour" className="border-t border-white/10 bg-[#080C10] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <img src="/assets/favicon.svg" alt="CloudDeck Mark" className="h-3.5 w-3.5 rounded shrink-0" />
            <span>Interactive feature tour</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            An integrated workbench for every layer of your stack
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Bare-metal FastCGI speed, 1-click Docker Compose catalogs, autonomous Site Doctor self-healing, and distributed fleet oversight.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-9 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
          {subsystems.map((sub) => {
            const SubIcon = sub.icon;
            const isActive = activeTab === sub.id;
            return (
              <button
                key={sub.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveTab(sub.id)}
                className={`group flex flex-col items-start rounded-xl border p-3.5 text-left transition-colors ${
                  isActive
                    ? "border-[#74B8CC]/50 bg-[#121A22] shadow-subtle ring-1 ring-[#74B8CC]/30"
                    : "border-white/10 bg-[#0D131A] hover:border-white/20 hover:bg-[#101720]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                      isActive
                        ? "border-[#74B8CC]/40 bg-[#74B8CC]/10 text-[#74B8CC]"
                        : "border-white/10 bg-white/5 text-[#8FA6B5] group-hover:text-[#F4F8FA]"
                    }`}
                  >
                    <SubIcon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] text-[#546C7B]">
                    {sub.tag}
                  </span>
                </div>
                <span
                  className={`mt-3 text-xs font-medium tracking-tight transition-colors ${
                    isActive ? "text-[#F4F8FA] font-semibold" : "text-[#8FA6B5] group-hover:text-[#F4F8FA]"
                  }`}
                >
                  {sub.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Main Interactive Stage */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0D131A] shadow-raised">
          {/* Deck Chrome Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#080C10] px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              <span className="text-xs font-mono font-medium text-[#F4F8FA]">
                subsystem://clouddeck/{current.id}
              </span>
              <span className="hidden sm:inline-block rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-[#8FA6B5]">
                idle &lt; 50MB
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-[#8FA6B5]">
              <span className="hidden md:inline-block text-[#546C7B]">cli:</span>
              <code className="rounded border border-white/10 bg-[#0D131A] px-2.5 py-1 text-[11px] text-[#74B8CC]">
                {current.cliCommand}
              </code>
            </div>
          </div>

          {/* Two-Column Stage Content */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left Column: Subsystem Details */}
            <div className="p-6 sm:p-7 lg:col-span-5 lg:border-r lg:border-white/10 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#121A22] text-[#74B8CC]">
                    <current.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-[#F4F8FA]">
                      {current.title}
                    </h3>
                    <p className="font-mono text-xs text-[#74B8CC]">
                      Zero-root bare metal execution
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                  {current.description}
                </p>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {current.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="rounded-lg border border-white/10 bg-[#080C10] p-2.5"
                    >
                      <div className="text-[10px] font-mono text-[#546C7B]">
                        {spec.label}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-[#F4F8FA]">
                        {spec.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Highlights List */}
                <ul className="space-y-2 pt-1 text-xs text-[#8FA6B5]">
                  {current.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <a
                  href="#install"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-4 py-2 text-xs font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-colors"
                >
                  <span>Quickstart install</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <span className="font-mono text-[11px] text-[#546C7B]">
                  Open-source MIT
                </span>
              </div>
            </div>

            {/* Right Column: Simulated Live Subsystem Deck */}
            <div className="bg-[#080C10] p-6 sm:p-7 lg:col-span-7 flex flex-col justify-center">
              {activeTab === "sites" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Active Virtual Hosts</span>
                    </div>
                    <span className="rounded bg-[#10B981]/10 px-2 py-0.5 font-mono text-[11px] font-medium text-[#10B981]">
                      14 sites active
                    </span>
                  </div>

                  {/* Interactive PHP Version Socket Switcher */}
                  <div className="rounded-xl border border-white/10 bg-[#0D131A] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#F4F8FA]">api.clouddeck.dev</span>
                      <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                        TLS 1.3 Active
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono text-[#8FA6B5]">
                        FastCGI PHP pool socket:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {["8.1", "8.2", "8.3", "8.4"].map((ver) => (
                          <button
                            key={ver}
                            type="button"
                            onClick={() => setSelectedPhp(ver)}
                            className={`rounded-lg py-1.5 font-mono text-xs font-medium transition-colors ${
                              selectedPhp === ver
                                ? "bg-[#74B8CC] text-[#080C10] font-semibold"
                                : "border border-white/10 bg-white/5 text-[#8FA6B5] hover:text-[#F4F8FA]"
                            }`}
                          >
                            PHP {ver}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-[#080C10] p-2.5 font-mono text-[11px] text-[#8FA6B5] space-y-1">
                      <div className="text-[#546C7B]"># Active FastCGI upstream socket:</div>
                      <div className="text-[#74B8CC]">
                        fastcgi_pass unix:/run/php/php{selectedPhp}-fpm.sock;
                      </div>
                      <div className="text-[#546C7B]">
                        fastcgi_index index.php; # Socket latency: 0.14ms kernel IPC
                      </div>
                    </div>
                  </div>

                  {/* Vhost List */}
                  <div className="space-y-1.5">
                    {[
                      { domain: "portal.example.com", runtime: "PHP 8.4", root: "/www/portal.example.com/public", ssl: "Wildcard" },
                      { domain: "docs.internal.net", runtime: "Static SPA", root: "/www/docs.internal.net/dist", ssl: "Let's Encrypt" },
                      { domain: "checkout.store.io", runtime: "Node.js", root: "/www/checkout.store.io/dist", ssl: "Auto-Renew" },
                    ].map((site) => (
                      <div
                        key={site.domain}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0D131A] px-3 py-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-medium text-[#F4F8FA]">{site.domain}</div>
                          <div className="font-mono text-[10px] text-[#546C7B]">{site.root}</div>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[#8FA6B5]">
                            {site.runtime}
                          </span>
                          <span className="text-emerald-400">✓ {site.ssl}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "appstore" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Docker Compose Subsystem</span>
                    </div>
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#74B8CC]">
                      Custom YAML supported
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { name: "Ghost Publishing", port: ":2368", url: "blog.domain.com", status: "Running", mem: "62 MB" },
                      { name: "Redis Cache Store", port: ":6379", url: "redis.internal:6379", status: "Running", mem: "8 MB" },
                      { name: "MinIO S3 Storage", port: ":9000", url: "s3.storage.dev", status: "Running", mem: "48 MB" },
                      { name: "PocketBase Backend", port: ":8090", url: "api.pocketbase.io", status: "Running", mem: "24 MB" },
                    ].map((app) => (
                      <div
                        key={app.name}
                        className="rounded-xl border border-white/10 bg-[#0D131A] p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">{app.name}</span>
                          <span className="font-mono text-[10px] text-emerald-400">
                            {app.status}
                          </span>
                        </div>
                        <div className="space-y-0.5 font-mono text-[11px]">
                          <div className="text-[#8FA6B5]">Port: <span className="text-[#74B8CC]">{app.port}</span></div>
                          <div className="text-[#546C7B] truncate">Proxy: {app.url}</div>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px] font-mono text-[#546C7B]">
                          <span>RAM: {app.mem}</span>
                          <span className="text-[#74B8CC]">Nginx upstream ✓</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#0D131A] p-2.5 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Deploy custom multi-container compose:</span>
                    <span className="text-[#74B8CC]">POST /v1/appstore/custom</span>
                  </div>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Autonomous Site Doctor</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunDoctor}
                      disabled={doctorDiagnosing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#74B8CC] hover:bg-white/10 transition-colors"
                    >
                      <RefreshCw className={`h-3 w-3 ${doctorDiagnosing ? "animate-spin" : ""}`} />
                      <span>{doctorDiagnosing ? "Diagnosing..." : "Run diagnostic fix"}</span>
                    </button>
                  </div>

                  {/* Doctor Health Score Gauge */}
                  <div className="rounded-xl border border-white/10 bg-[#0D131A] p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-mono text-[#8FA6B5]">Diagnostic health index</div>
                      <div className="mt-0.5 text-3xl font-semibold font-mono text-[#10B981]">
                        {doctorScore} <span className="text-sm font-normal text-[#8FA6B5]">/ 100</span>
                      </div>
                      <div className="text-xs text-[#8FA6B5] mt-0.5">8 system subsystems probed &amp; operational</div>
                    </div>
                    <div className="text-right font-mono text-[11px] space-y-1">
                      <div className="text-emerald-400">✓ Nginx syntax valid</div>
                      <div className="text-emerald-400">✓ PHP sockets responsive</div>
                      <div className="text-emerald-400">✓ SSL auto-renew configured</div>
                    </div>
                  </div>

                  {/* Coding Agents Launcher preview */}
                  <div className="rounded-xl border border-white/10 bg-[#080C10] p-3 font-mono text-xs space-y-2">
                    <div className="text-[#546C7B]"># Supported developer AI agents in server terminal:</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded border border-white/10 bg-[#0D131A] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">claude</span> --mode=code
                      </div>
                      <div className="rounded border border-white/10 bg-[#0D131A] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">codex</span> --stream
                      </div>
                      <div className="rounded border border-white/10 bg-[#0D131A] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">ollama</span> run deepseek-coder
                      </div>
                      <div className="rounded border border-white/10 bg-[#0D131A] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">hermes</span> diagnose --auto
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "fleet" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Distributed Cluster Nodes</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#10B981]">3 nodes in mesh</span>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: "lon-01", name: "srv-lon-01 (Primary Node)", region: "London, UK", ping: "12ms", ram: "44MB", cpu: "2.8%", sites: 8 },
                      { id: "nyc-02", name: "srv-nyc-02 (Worker Node)", region: "New York, USA", ping: "36ms", ram: "48MB", cpu: "4.2%", sites: 14 },
                      { id: "fra-01", name: "srv-fra-01 (Edge Node)", region: "Frankfurt, DE", ping: "18ms", ram: "39MB", cpu: "1.9%", sites: 6 },
                    ].map((node) => {
                      const isNodeActive = activeFleetNode === node.id;
                      return (
                        <div
                          key={node.id}
                          onClick={() => setActiveFleetNode(node.id)}
                          className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                            isNodeActive
                              ? "border-[#74B8CC]/50 bg-[#121A22] ring-1 ring-[#74B8CC]/30"
                              : "border-white/10 bg-[#0D131A] hover:border-white/20 hover:bg-[#101720]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[#F4F8FA]">{node.name}</span>
                            </div>
                            <span className="font-mono text-[11px] text-[#74B8CC]">{node.ping}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[#8FA6B5]">
                            <span>{node.region}</span>
                            <span>RAM: {node.ram}</span>
                            <span>CPU: {node.cpu}</span>
                            <span className="text-[#F4F8FA]">{node.sites} sites</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#0D131A] p-2.5 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Active node target: <span className="text-[#F4F8FA]">srv-{activeFleetNode}</span></span>
                    <span className="text-[#10B981]">Context switched</span>
                  </div>
                </div>
              )}

              {activeTab === "git" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Atomic Releases &amp; Rollback</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRollback}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#FAAA93] hover:bg-white/10 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{rollbackSuccess ? "Swapped to #141!" : "Rollback to #141"}</span>
                    </button>
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    <div className="rounded-xl border border-[#74B8CC]/40 bg-[#121A22] p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA] font-semibold">Release #142 (active)</span>
                        <span className="text-emerald-400 font-mono text-[10px]">CURRENT UPSTREAM</span>
                      </div>
                      <div className="text-[11px] text-[#8FA6B5]">Commit: <span className="text-[#74B8CC]">4b3e90a</span> — fix(panel): resolve runtime detection</div>
                      <div className="text-[10px] text-[#546C7B]">Symlink: /www/api.dev -&gt; /opt/releases/api.dev/20261126-0600</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0D131A] p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA]">Release #141</span>
                        <span className="text-[#8FA6B5] text-[10px]">PREVIOUS CLEAN (Ready)</span>
                      </div>
                      <div className="text-[11px] text-[#8FA6B5]">Commit: <span className="text-[#74B8CC]">9a5fa26</span> — fix(services): enhance recovery</div>
                      <div className="text-[10px] text-[#546C7B]">Symlink: /opt/releases/api.dev/20261124-1230</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#0D131A] p-2.5 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Webhook deploy endpoint:</span>
                    <span className="text-[#74B8CC]">POST /v1/sites/:dom/git/webhook</span>
                  </div>
                </div>
              )}

              {activeTab === "sec" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">PowerDNS &amp; Production Mail</span>
                    </div>
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#10B981]">
                      DKIM 2048 Signed
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0D131A] p-3.5 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between text-[#F4F8FA]">
                      <span>DNS Zone: clouddeck.dakshraman.in</span>
                      <span className="text-[#74B8CC]">PowerDNS SQLite</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-[#8FA6B5] border-t border-white/10 pt-2">
                      <div>A &nbsp;&nbsp;&nbsp;&nbsp; @ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 198.51.100.24 (TTL 300)</div>
                      <div>MX &nbsp;&nbsp;&nbsp; 10 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mail.clouddeck.dakshraman.in</div>
                      <div>TXT &nbsp;&nbsp; default._domainkey &nbsp; &quot;v=DKIM1; k=rsa; p=MIIBIjANBg...&quot;</div>
                      <div>TXT &nbsp;&nbsp; _dmarc &nbsp; &quot;v=DMARC1; p=reject; rua=mailto:dmarc@...&quot;</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#0D131A] p-2.5 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Roundcube Webmail SSO:</span>
                    <span className="text-[#10B981]">Direct One-Click Login ✓</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
