"use client";

import { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  Server,
  Layers,
  ArrowRight,
  Shield,
  Activity,
  Globe,
  Database,
  Cpu,
  Lock,
  ExternalLink,
} from "lucide-react";

export function Hero() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "sites" | "services" | "terminal">("overview");

  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="top" className="relative pt-10 pb-16 sm:pt-14 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Release Pill */}
        <div className="flex justify-center">
          <a
            href="#install"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#8FA6B5] hover:border-[#74B8CC]/40 hover:text-[#F4F8FA] transition"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
            <span className="font-semibold text-[#F4F8FA]">CloudDeck v0.6.55</span>
            <span className="text-white/20">•</span>
            <span>Zero-Root Linux Control Panel &amp; Local Dev Suite</span>
            <ArrowRight className="h-3 w-3 text-[#74B8CC]" />
          </a>
        </div>

        {/* Hero Title */}
        <div className="mt-8 text-center max-w-3xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight text-[#F4F8FA] sm:text-5xl sm:leading-[1.15]">
            The lightweight Linux hosting deck for modern developers
          </h1>

          <p className="mt-5 text-base sm:text-lg text-[#8FA6B5] leading-relaxed">
            Manage websites, multi-PHP (8.1–8.4), MariaDB, production email, and PowerDNS from one unified deck consuming <span className="text-[#F4F8FA] font-medium">under 50MB of idle RAM</span> — with zero root processes exposed to the web.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#install"
            className="flex items-center gap-2 rounded-lg bg-[#74B8CC] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#0A0E13] hover:bg-[#85c6d8] transition"
          >
            <span>Install Quickstart</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>

          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-xs sm:text-sm font-medium text-[#F4F8FA] hover:bg-white/10 hover:border-white/20 transition"
          >
            <span>Documentation &amp; Source</span>
            <ExternalLink className="h-3.5 w-3.5 text-[#8FA6B5]" />
          </a>
        </div>

        {/* 1-Click Terminal Command Bar */}
        <div className="mt-6 flex justify-center">
          <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101720] px-4 py-2.5 shadow-subtle sm:px-5">
            <div className="flex items-center gap-2.5 overflow-hidden font-mono text-xs sm:text-sm">
              <span className="text-[#74B8CC] select-none font-bold">$</span>
              <span className="truncate text-[#F4F8FA]">{installCommand}</span>
            </div>

            <span className="sr-only" role="status">
              {copied ? "Installation command copied to clipboard" : ""}
            </span>

            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
              aria-label="Copy installation command"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#10B981]" />
                  <span className="text-[#10B981]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* The Moment: Authentic Hero Product Console */}
        <div className="mt-12 rounded-xl border border-white/10 bg-[#101720] shadow-raised overflow-hidden">
          {/* Deck Top Header */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#0D141C] px-4 py-2.5 sm:px-5 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-2 text-xs font-mono text-[#8FA6B5]">
                <Server className="h-3.5 w-3.5 text-[#74B8CC]" />
                <span className="text-[#F4F8FA] font-medium">srv-prod-01</span>
                <span className="text-white/30">(Ubuntu 24.04 LTS)</span>
              </div>
            </div>

            {/* Architecture Mode Badge */}
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-[#8FA6B5]">
                <Shield className="h-3 w-3 text-[#10B981]" />
                <span>Panel: unprivileged (:2083)</span>
              </span>
              <span className="text-white/20">•</span>
              <span className="text-[#8FA6B5]">Agent: root daemon (:9090)</span>
            </div>
          </div>

          {/* Telemetry Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/10 border-b border-white/10 bg-[#121A24] text-xs">
            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Memory Utilization</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">48.2 MB</span>
                <span className="text-[11px] font-mono text-[#10B981]">4.7% of 1 GB</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">System Load / CPU</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">0.08, 0.04</span>
                <span className="text-[11px] font-mono text-[#8FA6B5]">1.2% 1 vCPU</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Websites &amp; Pools</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">12 Active</span>
                <span className="text-[11px] font-mono text-[#74B8CC]">PHP 8.1–8.4</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Core Services</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#10B981] tabular-nums">All Running</span>
                <span className="text-[11px] font-mono text-[#8FA6B5]">Nginx + MariaDB</span>
              </div>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-[#0E151E] px-4">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                activeTab === "overview"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sites")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                activeTab === "sites"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Websites (12)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("services")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                activeTab === "services"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Systemd Services</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                activeTab === "terminal"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Agent Terminal</span>
            </button>
          </div>

          {/* Interactive Viewport Content */}
          <div className="p-4 sm:p-5 min-h-[220px]">
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Service status table */}
                  <div className="rounded-lg border border-white/10 bg-[#0C121A] p-3.5">
                    <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-2.5 flex items-center justify-between">
                      <span>SYSTEMD SERVICE STATUS</span>
                      <span className="text-[11px] text-[#10B981]">monitored</span>
                    </div>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA]">nginx.service</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          active (running)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA]">php8.4-fpm.service</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          active (running)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA]">mariadb.service</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          active (running)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#F4F8FA]">clouddeck-agent.service</span>
                        <span className="text-[#10B981] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          active (127.0.0.1:9090)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Audit log trail */}
                  <div className="rounded-lg border border-white/10 bg-[#0C121A] p-3.5">
                    <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-2.5 flex items-center justify-between">
                      <span>AUDIT LOG STREAM (JSONL)</span>
                      <span className="text-[11px] text-[#8FA6B5]">tail -n 4</span>
                    </div>
                    <div className="space-y-1.5 text-xs font-mono text-[#8FA6B5]">
                      <div className="truncate">
                        <span className="text-[#546C7B]">07:31:02</span>{" "}
                        <span className="text-[#74B8CC]">ssl.renew</span>{" "}
                        <span className="text-[#F4F8FA]">app.example.com</span> [Let&apos;s Encrypt OK]
                      </div>
                      <div className="truncate">
                        <span className="text-[#546C7B]">07:28:44</span>{" "}
                        <span className="text-[#74B8CC]">vhost.apply</span>{" "}
                        <span className="text-[#F4F8FA]">nginx -t</span> [test passed, reloaded]
                      </div>
                      <div className="truncate">
                        <span className="text-[#546C7B]">07:15:19</span>{" "}
                        <span className="text-[#74B8CC]">backup.zip</span>{" "}
                        <span className="text-[#F4F8FA]">api.example.com</span> [142MB written]
                      </div>
                      <div className="truncate">
                        <span className="text-[#546C7B]">07:00:00</span>{" "}
                        <span className="text-[#74B8CC]">cron.job</span>{" "}
                        <span className="text-[#F4F8FA]">php artisan schedule:run</span> [exit 0]
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "sites" && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-[#8FA6B5]">
                      <th className="pb-2 font-normal">Domain</th>
                      <th className="pb-2 font-normal">Runtime / Socket</th>
                      <th className="pb-2 font-normal">Document Root</th>
                      <th className="pb-2 font-normal">SSL</th>
                      <th className="pb-2 font-normal text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="py-2.5 text-[#F4F8FA] font-medium">api.clouddeck.local</td>
                      <td className="py-2.5 text-[#74B8CC]">PHP 8.4 (unix socket)</td>
                      <td className="py-2.5 text-[#8FA6B5]">/www/wwwroot/api/public</td>
                      <td className="py-2.5 text-[#10B981]">Let&apos;s Encrypt (88d)</td>
                      <td className="py-2.5 text-right text-[#10B981]">Active</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-[#F4F8FA] font-medium">billing.store.com</td>
                      <td className="py-2.5 text-[#74B8CC]">PHP 8.3 (unix socket)</td>
                      <td className="py-2.5 text-[#8FA6B5]">/www/wwwroot/billing/web</td>
                      <td className="py-2.5 text-[#10B981]">Let&apos;s Encrypt (64d)</td>
                      <td className="py-2.5 text-right text-[#10B981]">Active</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 text-[#F4F8FA] font-medium">docs.internal.net</td>
                      <td className="py-2.5 text-[#FAAA93]">Node.js 22 (proxy :3000)</td>
                      <td className="py-2.5 text-[#8FA6B5]">/www/wwwroot/docs</td>
                      <td className="py-2.5 text-[#10B981]">Local CA Trusted</td>
                      <td className="py-2.5 text-right text-[#10B981]">Active</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "services" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-[#0C121A] p-3 text-xs font-mono">
                  <div className="text-[#8FA6B5] text-[11px]">Web Server</div>
                  <div className="mt-1 font-semibold text-[#F4F8FA]">Nginx 1.26.1</div>
                  <div className="mt-2 text-[#10B981] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    Ports 80, 443 active
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#0C121A] p-3 text-xs font-mono">
                  <div className="text-[#8FA6B5] text-[11px]">Database Engine</div>
                  <div className="mt-1 font-semibold text-[#F4F8FA]">MariaDB 11.4 LTS</div>
                  <div className="mt-2 text-[#10B981] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    127.0.0.1:3306 active
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#0C121A] p-3 text-xs font-mono">
                  <div className="text-[#8FA6B5] text-[11px]">Authoritative DNS</div>
                  <div className="mt-1 font-semibold text-[#F4F8FA]">PowerDNS 4.9.2</div>
                  <div className="mt-2 text-[#10B981] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    UDP/TCP :53 active
                  </div>
                </div>
              </div>
            )}

            {activeTab === "terminal" && (
              <div className="rounded-lg border border-white/10 bg-[#080C10] p-3 font-mono text-xs text-[#8FA6B5] space-y-1.5">
                <div className="text-[#F4F8FA]">
                  <span className="text-[#74B8CC]">clouddeck@srv-prod-01</span>:<span className="text-[#8FA6B5]">~</span>$ clouddeck status
                </div>
                <div className="text-[#8FA6B5] whitespace-pre-wrap leading-relaxed">
{`CloudDeck v0.6.55 (Go stdlib runtime)
  Daemon:     active (PID 842, 127.0.0.1:9090)
  Web Panel:  active (PID 910, :2083, user: clouddeck)
  RAM usage:  48.2 MB / 1.0 GB (idle target < 50MB: PASSED)
  Vhosts:     12 sites configured (0 errors)
  PHP Pools:  8.1, 8.2, 8.3, 8.4 active
  Audit log:  /var/log/clouddeck/audit.log (ok)`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
