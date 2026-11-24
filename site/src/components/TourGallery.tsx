"use client";

import { useState } from "react";
import {
  Globe,
  LayoutGrid,
  Server,
  Bot,
  Database,
  Shield,
  Clock,
  ArrowRight,
  Check,
  Terminal,
  Activity,
  HardDrive,
  Cpu,
  RefreshCw,
  ExternalLink,
  Layers,
  Lock,
  Mail,
  Zap,
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
  const [selectedPhp, setSelectedPhp] = useState<string>("8.3");
  const [activeFleetNode, setActiveFleetNode] = useState<string>("lon-01");
  const [doctorDiagnosing, setDoctorDiagnosing] = useState<boolean>(false);
  const [doctorScore, setDoctorScore] = useState<number>(98);

  const subsystems: Subsystem[] = [
    {
      id: "sites",
      tag: "Runtime",
      label: "Websites & PHP",
      icon: Globe,
      title: "Coexisting Multi-PHP & Nginx Vhosts",
      description:
        "Provision isolated Unix domain sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously. Direct fastcgi_pass routing delivers sub-millisecond execution with zero Docker virtualization latency.",
      cliCommand: "clouddeck sites list --runtime=php",
      specs: [
        { label: "Execution Latency", value: "< 0.2ms socket" },
        { label: "PHP Socket Footprint", value: "~14 MB / pool" },
        { label: "SSL Automation", value: "Let's Encrypt + Wildcard" },
        { label: "OPcache & Extensions", value: "1-Click Visual Toggle" },
      ],
      highlights: [
        "Zero container overhead",
        "Dedicated Unix domain sockets per PHP version",
        "Visual php.ini memory limits & execution timeouts",
        "Automated HTTPS with auto-renewing ACME certificates",
      ],
    },
    {
      id: "appstore",
      tag: "PaaS",
      label: "App Store & Compose",
      icon: LayoutGrid,
      title: "1-Click Stacks & Custom Docker Compose",
      description:
        "Deploy production services or paste arbitrary multi-container docker-compose.yml files. CloudDeck isolates containers, injects safe ports, and auto-configures Nginx reverse proxying with TLS termination.",
      cliCommand: "clouddeck appstore list && clouddeck apps status",
      specs: [
        { label: "Curated Catalog", value: "Redis, Mongo, Ghost, n8n, MinIO" },
        { label: "Custom Ingestion", value: "Arbitrary docker-compose.yml" },
        { label: "Reverse Proxying", value: "Automated Nginx upstream" },
        { label: "Log Streaming", value: "Live stdout/stderr stream" },
      ],
      highlights: [
        "Curated 1-click catalog (Redis, MongoDB, Ghost, MinIO, PocketBase)",
        "Paste custom compose YAML with auto-detected service ports",
        "Auto-configured Nginx reverse proxy to external domains",
        "Zero manual port conflicts with intelligent allocation",
      ],
    },
    {
      id: "fleet",
      tag: "Infrastructure",
      label: "Fleet Multi-Server",
      icon: Server,
      title: "Unified Cluster & Node Mesh",
      description:
        "Oversee multiple Linux servers across AWS, Hetzner, DigitalOcean, or on-premise hardware from one panel. Secure token handshakes stream node heartbeats, latency pings, and resource graphs.",
      cliCommand: "clouddeck fleet status --all-nodes",
      specs: [
        { label: "Node Heartbeat", value: "15s interval via TLS" },
        { label: "Cluster Mesh", value: "Zero master bottlenecks" },
        { label: "Cross-Server Auth", value: "Ed25519 node tokens" },
        { label: "Context Switch", value: "Instant 0-downtime switch" },
      ],
      highlights: [
        "Single-deck control across distributed global server fleets",
        "Live round-trip latency pings and hardware load metrics",
        "Seamless context switching between local and remote agents",
        "Centralized configuration rollback and health oversight",
      ],
    },
    {
      id: "ai",
      tag: "Automation",
      label: "Developer AI & Doctor",
      icon: Bot,
      title: "Site Diagnostics & Coding Agents",
      description:
        "Launch native coding agents (Claude Code, OpenAI Codex, Antigravity, OpenCode, Ollama) directly within your server environment. The autonomous Site Doctor runs 8-point system diagnostics with 1-click fixes.",
      cliCommand: "clouddeck doctor --fix --ai-agent=codex",
      specs: [
        { label: "Integrated Agents", value: "Claude, Codex, Ollama, Hermes" },
        { label: "Diagnostic Scoring", value: "0–100 System Health Index" },
        { label: "Remediation", value: "Autonomous 1-click repair" },
        { label: "Offline LLM", value: "Direct Ollama API integration" },
      ],
      highlights: [
        "8 native coding agent integrations inside web terminal",
        "Autonomous Site Doctor diagnostics covering Nginx, PHP, MariaDB",
        "1-click remediation for permission faults and syntax errors",
        "Offline local AI capability via local Ollama models",
      ],
    },
    {
      id: "db",
      tag: "Storage",
      label: "Databases & S3 Backups",
      icon: Database,
      title: "MariaDB & Automated S3 Cloud Dumps",
      description:
        "Manage MariaDB databases and users with deep-linked phpMyAdmin SSO. Schedule automated database dumps and snapshot rotations directly to S3-compatible cloud storage (Cloudflare R2, AWS S3, Backblaze).",
      cliCommand: "clouddeck db list && clouddeck backup db --target=s3",
      specs: [
        { label: "Database Engine", value: "MariaDB 10.11+ LTS" },
        { label: "phpMyAdmin", value: "1-Click Direct Schema SSO" },
        { label: "Cloud Backup", value: "AWS S3, Cloudflare R2, B2" },
        { label: "Retention Policy", value: "Configurable rotation & prune" },
      ],
      highlights: [
        "Zero-credential phpMyAdmin direct deep links into schemas",
        "Automated scheduled cron dumps with gzip compression",
        "Direct export to Cloudflare R2, AWS S3, and Backblaze B2",
        "Instant in-place database restoration from cloud snapshots",
      ],
    },
    {
      id: "sec",
      tag: "Security",
      label: "Mail, DNS & Security",
      icon: Shield,
      title: "PowerDNS, Postfix & 2FA Hardening",
      description:
        "Built-in authoritative SQLite PowerDNS, production Postfix/Dovecot with automated RSA-2048 DKIM, hardware-level UFW firewall controls, and enterprise RFC 6238 TOTP two-factor authentication.",
      cliCommand: "clouddeck security audit --firewall --auth",
      specs: [
        { label: "DNS Nameserver", value: "Authoritative PowerDNS" },
        { label: "Mail Encryption", value: "RSA-2048 DKIM & SPF/DMARC" },
        { label: "2FA Protection", value: "RFC 6238 TOTP + 8 recovery codes" },
        { label: "Intrusion Guard", value: "Fail2ban integration & UFW" },
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
    }, 900);
  };

  return (
    <section id="features" className="border-t border-white/5 bg-[#0C121A] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <img src="/assets/favicon.svg" alt="CloudDeck Mark" className="h-3.5 w-3.5 rounded shrink-0" />
            <span>Interactive Subsystem Tour</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Everything your server needs, under one deck
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Explore how CloudDeck combines bare-metal LEMP speed, 1-click Docker Compose apps, multi-server fleet management, and AI diagnostics.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
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
                className={`group flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                  isActive
                    ? "border-[#74B8CC]/40 bg-[#141E28] shadow-subtle ring-1 ring-[#74B8CC]/30"
                    : "border-white/5 bg-[#0E151E] hover:border-white/10 hover:bg-[#121A23]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                      isActive
                        ? "border-[#74B8CC]/40 bg-[#74B8CC]/10 text-[#74B8CC]"
                        : "border-white/5 bg-white/5 text-[#8FA6B5] group-hover:text-[#F4F8FA]"
                    }`}
                  >
                    <SubIcon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] text-[#546C7B] uppercase tracking-wider">
                    {sub.tag}
                  </span>
                </div>
                <span
                  className={`mt-3 text-xs font-medium tracking-tight transition ${
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
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#101720] shadow-raised">
          {/* Deck Chrome Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0E151E] px-5 py-3.5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-xs font-mono font-medium text-[#F4F8FA]">
                subsystem://clouddeck/{current.id}
              </span>
              <span className="hidden sm:inline-block rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-[#8FA6B5]">
                idle &lt; 50MB
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs text-[#8FA6B5]">
              <span className="hidden md:inline-block text-[#546C7B]">CLI:</span>
              <code className="rounded border border-white/10 bg-[#080C10] px-2.5 py-1 text-[11px] text-[#74B8CC]">
                {current.cliCommand}
              </code>
            </div>
          </div>

          {/* Two-Column Stage Content */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left Column: Subsystem Details */}
            <div className="p-6 sm:p-8 lg:col-span-5 lg:border-r lg:border-white/10 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#18232F] text-[#74B8CC]">
                    <current.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#F4F8FA]">
                      {current.title}
                    </h3>
                    <p className="font-mono text-xs text-[#74B8CC]">
                      Zero-Root Bare Metal Execution
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[#8FA6B5] leading-relaxed">
                  {current.description}
                </p>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  {current.specs.map((spec) => (
                    <div
                      key={spec.label}
                      className="rounded-lg border border-white/5 bg-[#0A0E13] p-2.5"
                    >
                      <div className="text-[10px] font-mono text-[#546C7B] uppercase tracking-wider">
                        {spec.label}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-semibold text-[#F4F8FA]">
                        {spec.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Highlights List */}
                <ul className="space-y-2 pt-2 text-xs text-[#8FA6B5]">
                  {current.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <a
                  href="#install"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-4 py-2 text-xs font-semibold text-[#0A0E13] hover:bg-[#85c6d8] transition"
                >
                  <span>Install CloudDeck</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
                <span className="font-mono text-[11px] text-[#546C7B]">
                  FOSS MIT License
                </span>
              </div>
            </div>

            {/* Right Column: Simulated Live Subsystem Deck */}
            <div className="bg-[#080C10] p-6 sm:p-8 lg:col-span-7 flex flex-col justify-center">
              {activeTab === "sites" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Active Vhost Inspector</span>
                    </div>
                    <span className="rounded-full bg-[#10B981]/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#10B981]">
                      12 Sites Online
                    </span>
                  </div>

                  {/* Interactive PHP Version Socket Switcher */}
                  <div className="rounded-xl border border-white/10 bg-[#0E151E] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#F4F8FA]">api.clouddeck.dev</span>
                      <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                        TLS 1.3 Active
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono text-[#8FA6B5]">
                        FastCGI PHP Socket:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {["8.1", "8.2", "8.3", "8.4"].map((ver) => (
                          <button
                            key={ver}
                            type="button"
                            onClick={() => setSelectedPhp(ver)}
                            className={`rounded-lg py-1.5 font-mono text-xs font-medium transition ${
                              selectedPhp === ver
                                ? "bg-[#74B8CC] text-[#0A0E13] shadow-sm font-semibold"
                                : "border border-white/10 bg-white/5 text-[#8FA6B5] hover:text-[#F4F8FA]"
                            }`}
                          >
                            PHP {ver}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/5 bg-[#080C10] p-2.5 font-mono text-[11px] text-[#8FA6B5] space-y-1">
                      <div className="text-[#546C7B]"># Active Nginx FastCGI configuration:</div>
                      <div className="text-[#74B8CC]">
                        fastcgi_pass unix:/run/php/php{selectedPhp}-fpm.sock;
                      </div>
                      <div className="text-[#546C7B]">
                        fastcgi_index index.php; # Socket Latency: 0.12ms (Direct Kernel IPC)
                      </div>
                    </div>
                  </div>

                  {/* Vhost Quick Directory Rows */}
                  <div className="space-y-2">
                    {[
                      { domain: "portal.example.com", php: "8.4", root: "/www/portal.example.com/public", ssl: "Wildcard" },
                      { domain: "docs.internal.net", php: "8.2", root: "/www/docs.internal.net/dist", ssl: "Auto-Renew" },
                    ].map((site) => (
                      <div
                        key={site.domain}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-[#0E151E] px-3.5 py-2.5 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-medium text-[#F4F8FA]">{site.domain}</div>
                          <div className="font-mono text-[10px] text-[#546C7B]">{site.root}</div>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[#8FA6B5]">
                            PHP {site.php}
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
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Docker Compose Subsystem</span>
                    </div>
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#74B8CC]">
                      Custom YAML Supported
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { name: "Ghost Publishing", port: ":2368", url: "blog.domain.com", status: "Running", mem: "62 MB" },
                      { name: "Redis Cache Store", port: ":6379", url: "redis.internal:6379", status: "Running", mem: "8 MB" },
                      { name: "MinIO S3 Storage", port: ":9000", url: "s3.storage.dev", status: "Running", mem: "48 MB" },
                      { name: "PocketBase Backend", port: ":8090", url: "api.pocketbase.io", status: "Running", mem: "24 MB" },
                    ].map((app) => (
                      <div
                        key={app.name}
                        className="rounded-xl border border-white/10 bg-[#0E151E] p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">{app.name}</span>
                          <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {app.status}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="text-[#8FA6B5]">Port: <span className="text-[#74B8CC]">{app.port}</span></div>
                          <div className="text-[#546C7B] truncate">Route: {app.url}</div>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[10px] font-mono text-[#546C7B]">
                          <span>RAM: {app.mem}</span>
                          <span className="text-[#74B8CC]">Nginx Proxy ✓</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-white/5 bg-[#0E151E] p-3 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Deploy arbitrary multi-container compose:</span>
                    <span className="text-[#74B8CC]">POST /v1/appstore/custom</span>
                  </div>
                </div>
              )}

              {activeTab === "fleet" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Distributed Cluster Nodes</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#10B981]">3 Nodes Synced</span>
                  </div>

                  <div className="space-y-2">
                    {[
                      { id: "lon-01", name: "srv-lon-01 (Primary Node)", region: "London, UK", ping: "14ms", ram: "42MB", cpu: "3.2%", sites: 8 },
                      { id: "nyc-02", name: "srv-nyc-02 (Worker Node)", region: "New York, USA", ping: "38ms", ram: "49MB", cpu: "5.1%", sites: 14 },
                      { id: "sgp-01", name: "srv-sgp-01 (Edge Node)", region: "Singapore", ping: "112ms", ram: "38MB", cpu: "2.4%", sites: 6 },
                    ].map((node) => {
                      const isNodeActive = activeFleetNode === node.id;
                      return (
                        <div
                          key={node.id}
                          onClick={() => setActiveFleetNode(node.id)}
                          className={`cursor-pointer rounded-xl border p-3.5 transition ${
                            isNodeActive
                              ? "border-[#74B8CC]/40 bg-[#121B24] ring-1 ring-[#74B8CC]/20"
                              : "border-white/5 bg-[#0E151E] hover:border-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${isNodeActive ? "bg-[#10B981]" : "bg-emerald-600/70"}`} />
                              <span className="text-xs font-medium text-[#F4F8FA]">{node.name}</span>
                            </div>
                            <span className="font-mono text-[11px] text-[#74B8CC]">{node.ping}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#8FA6B5]">
                            <span>{node.region}</span>
                            <span>RAM: {node.ram}</span>
                            <span>CPU: {node.cpu}</span>
                            <span className="text-[#F4F8FA]">{node.sites} sites</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-white/5 bg-[#0E151E] p-2.5 font-mono text-[11px] text-[#8FA6B5] flex items-center justify-between">
                    <span>Active Target: <span className="text-[#F4F8FA]">srv-{activeFleetNode}</span></span>
                    <span className="text-[#10B981]">Context Switched</span>
                  </div>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">Autonomous Site Doctor Diagnostics</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunDoctor}
                      disabled={doctorDiagnosing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#74B8CC] hover:bg-white/10 transition"
                    >
                      <RefreshCw className={`h-3 w-3 ${doctorDiagnosing ? "animate-spin" : ""}`} />
                      <span>{doctorDiagnosing ? "Diagnosing..." : "Run Doctor"}</span>
                    </button>
                  </div>

                  {/* Doctor Score Radial / Gauge Mock */}
                  <div className="rounded-xl border border-white/10 bg-[#0E151E] p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-mono text-[#8FA6B5]">Diagnostic Health Score</div>
                      <div className="mt-0.5 text-3xl font-semibold font-mono text-[#10B981]">
                        {doctorScore} <span className="text-sm font-normal text-[#8FA6B5]">/ 100</span>
                      </div>
                      <div className="text-xs text-[#8FA6B5] mt-0.5">8 System Subsystems Operational</div>
                    </div>
                    <div className="text-right font-mono text-[11px] space-y-1">
                      <div className="text-emerald-400">✓ Nginx Syntax OK</div>
                      <div className="text-emerald-400">✓ PHP Socket Active</div>
                      <div className="text-emerald-400">✓ SSL Valid (82 days)</div>
                    </div>
                  </div>

                  {/* Coding Agents Launcher preview */}
                  <div className="rounded-xl border border-white/5 bg-[#080C10] p-3 font-mono text-xs space-y-2">
                    <div className="text-[#546C7B]"># Active AI Coding Agents available in web terminal:</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded border border-white/5 bg-[#0E151E] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">claude</span> --mode=code
                      </div>
                      <div className="rounded border border-white/5 bg-[#0E151E] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">codex</span> --stream
                      </div>
                      <div className="rounded border border-white/5 bg-[#0E151E] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">ollama</span> run codellama
                      </div>
                      <div className="rounded border border-white/5 bg-[#0E151E] p-2 text-[#F4F8FA]">
                        <span className="text-[#74B8CC]">hermes</span> doctor-fix
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "db" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">MariaDB & S3 Backup Scheduler</span>
                    </div>
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-[#74B8CC]">
                      MariaDB 10.11 LTS
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0E151E] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#F4F8FA]">production_db (InnoDB)</span>
                      <span className="font-mono text-xs text-[#8FA6B5]">42.8 MB</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-3">
                      <span className="text-[11px] font-mono text-[#8FA6B5]">Deep-linked phpMyAdmin:</span>
                      <span className="rounded bg-[#74B8CC] px-2.5 py-1 text-[11px] font-semibold text-[#0A0E13]">
                        Launch Schema SSO ↗
                      </span>
                    </div>
                  </div>

                  {/* S3 Cloud Backup Destination Card */}
                  <div className="rounded-xl border border-white/10 bg-[#0E151E] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Automated S3 Backup Schedule</span>
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                        Active Daily
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                      <div className="rounded bg-[#080C10] p-2 text-[#8FA6B5]">
                        <span className="text-[#546C7B]">Provider:</span> Cloudflare R2
                      </div>
                      <div className="rounded bg-[#080C10] p-2 text-[#8FA6B5]">
                        <span className="text-[#546C7B]">Retention:</span> 30 Days (auto-prune)
                      </div>
                    </div>

                    <div className="rounded border border-white/5 bg-[#080C10] p-2 font-mono text-[10px] text-[#546C7B] flex items-center justify-between">
                      <span>r2://backups/db/production_db-latest.sql.gz</span>
                      <span className="text-emerald-400">Verified ✓</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "sec" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#74B8CC]" />
                      <span className="text-xs font-semibold text-[#F4F8FA]">PowerDNS & Security Hardening</span>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400">Firewall Active</span>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-xl border border-white/10 bg-[#0E151E] p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium text-[#F4F8FA]">
                        <span>Authoritative PowerDNS (SQLite)</span>
                        <span className="font-mono text-[10px] text-[#74B8CC]">SOA / A / MX / TXT</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#546C7B]">
                        DKIM RSA-2048: mail._domainkey.example.com (Synchronized)
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0E151E] p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium text-[#F4F8FA]">
                        <span>Two-Factor Authentication</span>
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          RFC 6238 TOTP
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[#546C7B]">
                        8 Offline Backup Recovery Tokens stored in encrypted vault
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0E151E] p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium text-[#F4F8FA]">
                        <span>UFW & Fail2ban Jails</span>
                        <span className="font-mono text-[10px] text-emerald-400">0 Active Bans</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#546C7B]">
                        SSH :22, HTTP :80, HTTPS :443, DNS :53, Panel :2083
                      </div>
                    </div>
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
