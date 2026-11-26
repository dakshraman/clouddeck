"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  Sparkles,
  Play,
  HeartPulse,
} from "lucide-react";

interface Subsystem {
  id: string;
  tag: string;
  label: string;
  icon: typeof Globe;
  title: string;
  userStory: string;
  description: string;
  specs: { label: string; value: string }[];
  highlights: string[];
}

export function TourGallery() {
  const [activeTab, setActiveTab] = useState<string>("sites");
  const [selectedPhp, setSelectedPhp] = useState<string>("8.4");
  const [doctorDiagnosing, setDoctorDiagnosing] = useState<boolean>(false);
  const [doctorScore, setDoctorScore] = useState<number>(98);
  const [rollbackSuccess, setRollbackSuccess] = useState<boolean>(false);

  const subsystems: Subsystem[] = [
    {
      id: "sites",
      tag: "Hosting",
      label: "Websites & WordPress",
      icon: Globe,
      title: "Host fast, modern websites with zero fuss",
      userStory: "Easily launch WordPress, WooCommerce, custom PHP, or static sites. Add custom domains, enable HTTPS in 1 click, and never touch a raw server config file again.",
      description:
        "Dedicated Unix domain sockets for PHP 8.1, 8.2, 8.3, and 8.4 simultaneously. Direct FastCGI routing delivers sub-millisecond execution with zero Docker virtualization latency.",
      specs: [
        { label: "Site Load Speed", value: "Instant FastCGI" },
        { label: "Memory Footprint", value: "Only ~14 MB per site" },
        { label: "SSL Certificate", value: "Auto-renewing HTTPS" },
        { label: "PHP Version", value: "Switchable in 1 click" },
      ],
      highlights: [
        "Create WordPress or custom websites in seconds",
        "Free automatic SSL certificates that renew by themselves",
        "Switch between PHP versions per site with a simple dropdown",
        "Clean, modern file management directly inside your browser",
      ],
    },
    {
      id: "appstore",
      tag: "1-Click Apps",
      label: "App Store & Docker",
      icon: LayoutGrid,
      title: "Deploy popular web apps in 1 click",
      userStory: "Install your favorite tools—like Ghost blogs, n8n automations, Plausible analytics, or Redis—with a single button. CloudDeck handles containers, ports, and domains automatically.",
      description:
        "Deploy production services or paste arbitrary multi-container docker-compose.yml files. CloudDeck isolates containers, injects non-conflicting ports, and auto-configures Nginx reverse proxying with TLS termination.",
      specs: [
        { label: "App Catalog", value: "Ghost, n8n, Redis, MinIO" },
        { label: "Docker Integration", value: "Zero port conflicts" },
        { label: "Web Proxy", value: "Automatic domain routing" },
        { label: "Logs & Metrics", value: "Live view in panel" },
      ],
      highlights: [
        "Curated 1-click catalog of popular open source web apps",
        "Automated reverse proxy connects your domain to the app",
        "No port collisions—CloudDeck assigns ports intelligently",
        "Paste your own Docker Compose template whenever you want",
      ],
    },
    {
      id: "ai",
      tag: "Peace of Mind",
      label: "Self-Healing & Doctor",
      icon: Bot,
      title: "An automated doctor that fixes server issues for you",
      userStory: "Never get stuck on server errors or broken configs. The built-in Site Doctor checks your system health 24/7 and fixes issues like blocked ports or permissions with 1 click.",
      description:
        "Launch native coding agents directly in your server terminal. The autonomous Site Doctor runs deep system diagnostics with 1-click auto-repair.",
      specs: [
        { label: "Health Scoring", value: "0–100 System Rating" },
        { label: "Auto-Repair", value: "1-Click automated fix" },
        { label: "Checks Covered", value: "Nginx, SSL, PHP & DB" },
        { label: "AI Terminal", value: "Claude, Codex & Ollama" },
      ],
      highlights: [
        "Instant 0–100 health diagnostic across all server services",
        "1-click button to fix file permissions and service locks",
        "Real-time alerts before your visitors notice any trouble",
        "Built-in AI helper to answer technical questions in plain English",
      ],
    },
    {
      id: "fleet",
      tag: "Multi-Server",
      label: "Fleet Management",
      icon: Server,
      title: "Control multiple servers from a single dashboard",
      userStory: "Have servers across Hetzner, DigitalOcean, AWS, or local hardware? Manage all of them from one clean panel without logging in and out of different dashboards.",
      description:
        "Oversee multiple Linux servers across Hetzner, AWS, DigitalOcean, or on-premise hardware from one panel. Secure token handshakes stream node heartbeats, latency pings, and resource graphs.",
      specs: [
        { label: "Server Sync", value: "Real-time heartbeat" },
        { label: "Providers", value: "Any Linux VPS or bare metal" },
        { label: "Security", value: "Encrypted token access" },
        { label: "Switching", value: "1-Click instant switch" },
      ],
      highlights: [
        "Manage unlimited Linux servers from one unified screen",
        "Live CPU, memory, and disk usage graphs for every node",
        "Switch between servers instantly with zero lag",
        "No paid add-ons or expensive per-server licensing",
      ],
    },
    {
      id: "git",
      tag: "Deployments",
      label: "GitHub Sync & Rollback",
      icon: GitBranch,
      title: "Effortless code updates with instant undo",
      userStory: "Push code to GitHub or GitLab and have your website update automatically. If a bad update ever breaks your site, restore the previous working version with a single click.",
      description:
        "Deploy directly from GitHub or GitLab. Every deployment creates an immutable release directory, runs build scripts, and switches the Nginx symlink atomically with 1-click instant rollback.",
      specs: [
        { label: "Deploy Time", value: "Zero-downtime swap" },
        { label: "Rollback Speed", value: "Instant (< 1 second)" },
        { label: "Git Support", value: "GitHub, GitLab & Webhooks" },
        { label: "Safety", value: "Preserves previous 5 releases" },
      ],
      highlights: [
        "Automatic deployment when you push to main/production",
        "Zero downtime: visitors never see an error while upgrading",
        "1-Click rollback button to immediately undo bad deploys",
        "View complete build output logs directly inside the panel",
      ],
    },
    {
      id: "sec",
      tag: "Protection",
      label: "Email, DNS & Security",
      icon: Shield,
      title: "Built-in business email, DNS, and bulletproof security",
      userStory: "Create custom email addresses (@yourdomain.com), manage DNS records, and protect your server with automated firewalls and 2-Factor Authentication out of the box.",
      description:
        "Built-in authoritative SQLite PowerDNS, production Postfix/Dovecot with automated RSA-2048 DKIM, hardware-level UFW firewall controls, and enterprise RFC 6238 TOTP two-factor authentication.",
      specs: [
        { label: "Email Mailboxes", value: "Postfix + Dovecot + DKIM" },
        { label: "DNS Manager", value: "PowerDNS (A, CNAME, MX)" },
        { label: "Firewall Guard", value: "Automated Fail2ban & UFW" },
        { label: "Account Security", value: "2-Factor Authenticator" },
      ],
      highlights: [
        "Professional email addresses with automatic DKIM & SPF records",
        "Manage your domain DNS records visually with zero confusion",
        "Active firewall blocks brute-force attackers and spammers",
        "Protected by standard Authenticator app 2FA (Google, 1Password)",
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
    <section id="tour" className="border-t border-white/10 bg-[#080C10] py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#74B8CC]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Interactive Feature Tour</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Everything made simple, fast, and visual
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            See how CloudDeck turns complicated server administration into easy, 1-click visual workflows anyone can manage.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="mt-9 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
          {subsystems.map((sub) => {
            const SubIcon = sub.icon;
            const isActive = activeTab === sub.id;
            return (
              <motion.button
                key={sub.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab(sub.id)}
                className={`group flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                  isActive
                    ? "border-[#74B8CC]/60 bg-[#121A22] shadow-lg shadow-[#74B8CC]/10 ring-1 ring-[#74B8CC]/30"
                    : "border-white/10 bg-[#0D131A] hover:border-white/20 hover:bg-[#101720]"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                      isActive
                        ? "border-[#74B8CC]/40 bg-[#74B8CC]/15 text-[#74B8CC]"
                        : "border-white/10 bg-white/5 text-[#8FA6B5] group-hover:text-[#F4F8FA]"
                    }`}
                  >
                    <SubIcon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-[#546C7B]">
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
              </motion.button>
            );
          })}
        </div>

        {/* Active Subsystem Interactive Showcase Card */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-[#0D131A] p-5 sm:p-8 shadow-raised">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Column: Friendly Explanation */}
              <div className="lg:col-span-6 flex flex-col justify-between h-full">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-md bg-[#74B8CC]/10 px-2.5 py-1 text-xs font-semibold text-[#74B8CC]">
                    <current.icon className="h-3.5 w-3.5" />
                    <span>{current.label}</span>
                  </div>

                  <h3 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-[#F4F8FA]">
                    {current.title}
                  </h3>

                  <p className="mt-3 text-sm text-[#8FA6B5] leading-relaxed">
                    {current.userStory}
                  </p>

                  <div className="mt-6 space-y-2.5">
                    {current.highlights.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#F4F8FA]/90">
                        <Check className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-3 pt-6 border-t border-white/10">
                  {current.specs.map((spec, idx) => (
                    <div key={idx} className="rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                      <div className="text-[11px] text-[#8FA6B5]">{spec.label}</div>
                      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-[#F4F8FA]">{spec.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Visual Interactive Widget */}
              <div className="lg:col-span-6 rounded-xl border border-white/10 bg-[#080C10] p-4 sm:p-6 shadow-inner">
                {current.id === "sites" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Live Website Preview</span>
                      <span className="text-[11px] text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-ping" />
                        Online &amp; Fast
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-lg border border-white/10 bg-[#0D131A] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#F4F8FA]">example-blog.com</div>
                          <div className="text-[11px] text-[#8FA6B5]">WordPress 6.7 • Nginx FastCGI</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8FA6B5]">PHP:</span>
                          <select
                            value={selectedPhp}
                            onChange={(e) => setSelectedPhp(e.target.value)}
                            className="rounded-md border border-white/10 bg-[#121A22] px-2 py-1 text-xs text-[#74B8CC] font-mono focus:outline-none"
                          >
                            <option value="8.4">8.4 (Latest)</option>
                            <option value="8.3">8.3</option>
                            <option value="8.2">8.2</option>
                            <option value="8.1">8.1</option>
                          </select>
                        </div>
                      </div>

                      <div className="rounded-lg border border-white/10 bg-[#0D131A] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#F4F8FA]">client-app.io</div>
                          <div className="text-[11px] text-[#8FA6B5]">Node.js Next.js • Reverse Proxy</div>
                        </div>
                        <span className="text-xs text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded">SSL Active</span>
                      </div>

                      <div className="rounded-lg border border-white/10 bg-[#0D131A] p-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[#F4F8FA]">portfolio.dev</div>
                          <div className="text-[11px] text-[#8FA6B5]">Static HTML / CSS • CDN Ready</div>
                        </div>
                        <span className="text-xs text-[#74B8CC] bg-[#74B8CC]/10 px-2 py-0.5 rounded">0.05ms Load</span>
                      </div>
                    </div>
                  </div>
                )}

                {current.id === "appstore" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">1-Click Application Center</span>
                      <span className="text-[11px] text-[#74B8CC]">Ready to Install</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <motion.div whileHover={{ scale: 1.02 }} className="rounded-lg border border-white/10 bg-[#0D131A] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">WordPress</span>
                          <span className="text-[10px] text-[#10B981] bg-[#10B981]/15 px-1.5 py-0.5 rounded">CMS</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8FA6B5]">World&apos;s #1 site builder</p>
                        <button type="button" className="mt-3 w-full rounded bg-white/5 py-1 text-xs text-[#74B8CC] hover:bg-white/10 transition-colors">
                          Install in 1-Click
                        </button>
                      </motion.div>

                      <motion.div whileHover={{ scale: 1.02 }} className="rounded-lg border border-white/10 bg-[#0D131A] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">Ghost</span>
                          <span className="text-[10px] text-[#FAAA93] bg-[#FAAA93]/15 px-1.5 py-0.5 rounded">Publishing</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8FA6B5]">Modern newsletter &amp; blog</p>
                        <button type="button" className="mt-3 w-full rounded bg-white/5 py-1 text-xs text-[#74B8CC] hover:bg-white/10 transition-colors">
                          Install in 1-Click
                        </button>
                      </motion.div>

                      <motion.div whileHover={{ scale: 1.02 }} className="rounded-lg border border-white/10 bg-[#0D131A] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">n8n Workflow</span>
                          <span className="text-[10px] text-[#74B8CC] bg-[#74B8CC]/15 px-1.5 py-0.5 rounded">Automation</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8FA6B5]">Zapier alternative</p>
                        <button type="button" className="mt-3 w-full rounded bg-white/5 py-1 text-xs text-[#74B8CC] hover:bg-white/10 transition-colors">
                          Install in 1-Click
                        </button>
                      </motion.div>

                      <motion.div whileHover={{ scale: 1.02 }} className="rounded-lg border border-white/10 bg-[#0D131A] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#F4F8FA]">Plausible</span>
                          <span className="text-[10px] text-[#10B981] bg-[#10B981]/15 px-1.5 py-0.5 rounded">Analytics</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#8FA6B5]">Privacy-friendly analytics</p>
                        <button type="button" className="mt-3 w-full rounded bg-white/5 py-1 text-xs text-[#74B8CC] hover:bg-white/10 transition-colors">
                          Install in 1-Click
                        </button>
                      </motion.div>
                    </div>
                  </div>
                )}

                {current.id === "ai" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Site Doctor Diagnostic Tool</span>
                      <span className="text-[11px] font-mono text-[#10B981]">Health Score: {doctorScore}/100</span>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5 text-xs">
                        <span className="text-[#8FA6B5]">Nginx Configuration</span>
                        <span className="text-[#10B981]">Valid syntax ✓</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5 text-xs">
                        <span className="text-[#8FA6B5]">SSL Certificate Expiry</span>
                        <span className="text-[#10B981]">Valid (82 days left) ✓</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5 text-xs">
                        <span className="text-[#8FA6B5]">Database Connections</span>
                        <span className="text-[#10B981]">Responsive (0.8ms) ✓</span>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-white/10 flex justify-between items-center">
                      <span className="text-xs text-[#8FA6B5]">Everything running optimal</span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={handleRunDoctor}
                        disabled={doctorDiagnosing}
                        className="flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-3.5 py-1.5 text-xs font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-colors"
                      >
                        <HeartPulse className={`h-3.5 w-3.5 ${doctorDiagnosing ? "animate-spin" : ""}`} />
                        <span>{doctorDiagnosing ? "Diagnosing..." : "Run Health Check"}</span>
                      </motion.button>
                    </div>
                  </div>
                )}

                {current.id === "fleet" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Global Server Fleet</span>
                      <span className="text-[11px] text-[#10B981]">3 Nodes Connected</span>
                    </div>

                    <div className="mt-4 space-y-2.5 text-xs">
                      <div className="p-3 rounded-lg bg-[#0D131A] border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                          <div>
                            <div className="font-semibold text-[#F4F8FA]">Frankfurt Primary</div>
                            <div className="text-[11px] text-[#8FA6B5]">Hetzner Cloud • 12 Sites</div>
                          </div>
                        </div>
                        <span className="text-[#74B8CC] font-mono">1.2% CPU</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[#0D131A] border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                          <div>
                            <div className="font-semibold text-[#F4F8FA]">New York Replica</div>
                            <div className="text-[11px] text-[#8FA6B5]">DigitalOcean • 6 Sites</div>
                          </div>
                        </div>
                        <span className="text-[#74B8CC] font-mono">0.8% CPU</span>
                      </div>

                      <div className="p-3 rounded-lg bg-[#0D131A] border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                          <div>
                            <div className="font-semibold text-[#F4F8FA]">Local Office Backup</div>
                            <div className="text-[11px] text-[#8FA6B5]">Bare Metal • 2 Sites</div>
                          </div>
                        </div>
                        <span className="text-[#74B8CC] font-mono">0.4% CPU</span>
                      </div>
                    </div>
                  </div>
                )}

                {current.id === "git" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Automated Deployment Log</span>
                      <span className="text-[11px] text-[#10B981]">Zero Downtime</span>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-[#0D131A] border border-white/5 text-xs font-mono space-y-1">
                      <div className="text-[#10B981]">✓ Git commit e48a92 received from GitHub</div>
                      <div className="text-[#8FA6B5]">→ Installing dependencies and building site...</div>
                      <div className="text-[#8FA6B5]">→ Swapping active release symlink...</div>
                      <div className="text-[#74B8CC]">✓ Deployment successful in 1.4 seconds!</div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-[#8FA6B5]">Something went wrong?</span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={handleRollback}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                          rollbackSuccess
                            ? "border-[#10B981] bg-[#10B981]/15 text-[#10B981]"
                            : "border-white/10 bg-white/5 text-[#F4F8FA] hover:bg-white/10"
                        }`}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{rollbackSuccess ? "Restored Previous Version!" : "1-Click Undo / Rollback"}</span>
                      </motion.button>
                    </div>
                  </div>
                )}

                {current.id === "sec" && (
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <span className="text-xs font-semibold text-[#F4F8FA]">Security Shield</span>
                      <span className="text-[11px] text-[#10B981] bg-[#10B981]/15 px-2 py-0.5 rounded-full">Active Defense</span>
                    </div>

                    <div className="mt-4 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5">
                        <span className="text-[#F4F8FA]">Custom Business Mailbox</span>
                        <span className="text-[#10B981]">DKIM Signed ✓</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5">
                        <span className="text-[#F4F8FA]">Automated Firewall</span>
                        <span className="text-[#10B981]">Blocking Bad Traffic ✓</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D131A] border border-white/5">
                        <span className="text-[#F4F8FA]">Two-Factor Authentication</span>
                        <span className="text-[#10B981]">Enabled (TOTP) ✓</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
