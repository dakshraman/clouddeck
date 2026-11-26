"use client";

import { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  Server,
  ArrowRight,
  Shield,
  Activity,
  Globe,
  Database,
  Cpu,
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
    <section id="top" className="relative pt-8 pb-14 sm:pt-12 sm:pb-18">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Signal Banner */}
        <div className="flex justify-center">
          <a
            href="#architecture"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#8FA6B5] hover:border-[#74B8CC]/40 hover:text-[#F4F8FA] transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
            <span className="font-semibold text-[#F4F8FA]">Zero-root security</span>
            <span className="text-white/20">•</span>
            <span>Linux control panel &amp; local dev suite</span>
            <ArrowRight className="h-3 w-3 text-[#74B8CC]" />
          </a>
        </div>

        {/* Hero Headline & Lead */}
        <div className="mt-6 text-center max-w-3xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight text-[#F4F8FA] sm:text-5xl sm:leading-[1.14]">
            The ultra-lightweight Linux hosting deck.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-[#8FA6B5] leading-relaxed">
            Coexisting multi-PHP, MariaDB, Docker stacks, production mail, and PowerDNS in under 50MB RAM with zero root web processes.
          </p>
        </div>

        {/* Primary Actions */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#install"
            className="flex items-center gap-2 rounded-lg bg-[#74B8CC] px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-colors"
          >
            <span>Quickstart install</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>

          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-xs sm:text-sm font-medium text-[#F4F8FA] hover:bg-white/10 hover:border-white/20 transition-colors"
          >
            <span>View source on GitHub</span>
            <ExternalLink className="h-3.5 w-3.5 text-[#8FA6B5]" />
          </a>
        </div>

        {/* 1-Click Terminal Command Bar */}
        <div className="mt-5 flex justify-center">
          <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0D131A] px-4 py-2 shadow-subtle sm:px-5">
            <div className="flex items-center gap-2.5 overflow-hidden font-mono text-xs sm:text-sm">
              <span className="text-[#74B8CC] select-none font-bold">$</span>
              <span className="truncate text-[#F4F8FA]">{installCommand}</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition-colors"
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

        {/* Authentic Interactive Deck Console */}
        <div className="mt-10 rounded-xl border border-white/10 bg-[#0D131A] shadow-raised overflow-hidden">
          {/* Deck Header Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#080C10] px-4 py-2.5 sm:px-5 gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-2 text-xs font-mono text-[#8FA6B5]">
                <Server className="h-3.5 w-3.5 text-[#74B8CC]" />
                <span className="text-[#F4F8FA] font-medium">clouddeck-primary</span>
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
              <span className="text-[#8FA6B5]">Agent: root daemon (loopback)</span>
            </div>
          </div>

          {/* Telemetry Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/10 border-b border-white/10 bg-[#101720] text-xs">
            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Memory footprint</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">46.8 MB</span>
                <span className="text-[11px] font-mono text-[#10B981]">4.6% of 1GB</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">System load / CPU</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">0.06, 0.04</span>
                <span className="text-[11px] font-mono text-[#8FA6B5]">1.2% usage</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Active web stacks</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#F4F8FA] tabular-nums">14 Sites</span>
                <span className="text-[11px] font-mono text-[#74B8CC]">PHP 8.1–8.4 &amp; SPA</span>
              </div>
            </div>

            <div className="p-3 sm:px-4">
              <div className="text-[11px] text-[#8FA6B5] font-mono">Probed services</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-base font-semibold text-[#10B981] tabular-nums">All healthy</span>
                <span className="text-[11px] font-mono text-[#8FA6B5]">Nginx + MariaDB</span>
              </div>
            </div>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-[#090D12] px-4">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
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
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "sites"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Websites (14)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("services")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "services"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Services</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "terminal"
                  ? "border-[#74B8CC] text-[#F4F8FA]"
                  : "border-transparent text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>CLI console</span>
            </button>
          </div>

          {/* Tab Content Viewport */}
          <div className="p-4 sm:p-5 min-h-[220px]">
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Services Status Card */}
                <div className="rounded-lg border border-white/10 bg-[#080C10] p-3.5">
                  <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-2.5 flex items-center justify-between">
                    <span>Probed System Daemons</span>
                    <span className="text-[11px] text-[#10B981]">live</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F8FA]">nginx.service</span>
                      <span className="text-[#10B981] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        running (pid 1626)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F8FA]">php8.4-fpm.service</span>
                      <span className="text-[#10B981] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        running (socket /run/php/php8.4-fpm.sock)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F8FA]">php8.3-fpm.service</span>
                      <span className="text-[#10B981] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        running (socket /run/php/php8.3-fpm.sock)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F8FA]">mariadb.service</span>
                      <span className="text-[#10B981] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        running (10.11 LTS)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F8FA]">powerdns.service</span>
                      <span className="text-[#10B981] flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                        running (port 53)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Architecture Highlights Card */}
                <div className="rounded-lg border border-white/10 bg-[#080C10] p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono font-medium text-[#8FA6B5] mb-2.5 flex items-center justify-between">
                      <span>Zero-Root Execution Graph</span>
                      <span className="text-[11px] text-[#74B8CC]">sandboxed</span>
                    </div>
                    <p className="text-xs text-[#8FA6B5] leading-relaxed">
                      Web traffic terminates at unprivileged Nginx workers. The Next.js panel runs strictly as user <code className="text-[#F4F8FA] bg-white/5 px-1 py-0.5 rounded font-mono">clouddeck</code> with zero root permissions, invoking actions through the local Go daemon.
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="text-[#8FA6B5]">RAM per PHP pool: <span className="text-[#F4F8FA]">~14 MB</span></div>
                    <div className="text-[#8FA6B5]">Agent binary size: <span className="text-[#F4F8FA]">18 MB</span></div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "sites" && (
              <div className="space-y-2 text-xs font-mono">
                <div className="grid grid-cols-12 gap-2 pb-1.5 text-[11px] text-[#8FA6B5] border-b border-white/10 px-2 font-medium">
                  <div className="col-span-5 sm:col-span-4">Domain name</div>
                  <div className="col-span-3 sm:col-span-3">Runtime &amp; Socket</div>
                  <div className="col-span-2 sm:col-span-3">Security &amp; SSL</div>
                  <div className="col-span-2 text-right">Throughput</div>
                </div>

                <div className="grid grid-cols-12 gap-2 py-2 px-2 rounded hover:bg-white/[0.02] items-center border border-transparent hover:border-white/5">
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span className="text-[#F4F8FA] font-medium truncate">api.production.dev</span>
                  </div>
                  <div className="col-span-3 sm:col-span-3 text-[#74B8CC]">Node.js / Express</div>
                  <div className="col-span-2 sm:col-span-3 text-[#10B981]">Let&apos;s Encrypt (auto)</div>
                  <div className="col-span-2 text-right text-[#8FA6B5]">842 req/s</div>
                </div>

                <div className="grid grid-cols-12 gap-2 py-2 px-2 rounded hover:bg-white/[0.02] items-center border border-transparent hover:border-white/5">
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span className="text-[#F4F8FA] font-medium truncate">store.app.net</span>
                  </div>
                  <div className="col-span-3 sm:col-span-3 text-[#FAAA93]">PHP 8.4-FPM</div>
                  <div className="col-span-2 sm:col-span-3 text-[#10B981]">Wildcard SSL</div>
                  <div className="col-span-2 text-right text-[#8FA6B5]">1.4k req/s</div>
                </div>

                <div className="grid grid-cols-12 gap-2 py-2 px-2 rounded hover:bg-white/[0.02] items-center border border-transparent hover:border-white/5">
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span className="text-[#F4F8FA] font-medium truncate">dashboard.internal</span>
                  </div>
                  <div className="col-span-3 sm:col-span-3 text-[#74B8CC]">Static SPA (Vite)</div>
                  <div className="col-span-2 sm:col-span-3 text-[#10B981]">Let&apos;s Encrypt</div>
                  <div className="col-span-2 text-right text-[#8FA6B5]">320 req/s</div>
                </div>
              </div>
            )}

            {activeTab === "services" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="rounded border border-white/10 bg-[#080C10] p-3">
                  <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                    <span>Nginx Web Server</span>
                    <span className="text-[#10B981]">Active</span>
                  </div>
                  <div className="text-sm font-semibold text-[#F4F8FA]">v1.24.0</div>
                  <div className="mt-2 text-[11px] text-[#8FA6B5]">Direct FastCGI sockets &amp; HTTP/2</div>
                </div>

                <div className="rounded border border-white/10 bg-[#080C10] p-3">
                  <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                    <span>MariaDB Engine</span>
                    <span className="text-[#10B981]">Active</span>
                  </div>
                  <div className="text-sm font-semibold text-[#F4F8FA]">v10.11 LTS</div>
                  <div className="mt-2 text-[11px] text-[#8FA6B5]">InnoDB buffer auto-tuned to VPS size</div>
                </div>

                <div className="rounded border border-white/10 bg-[#080C10] p-3">
                  <div className="flex items-center justify-between text-[#8FA6B5] mb-1">
                    <span>PowerDNS Authoritative</span>
                    <span className="text-[#10B981]">Active</span>
                  </div>
                  <div className="text-sm font-semibold text-[#F4F8FA]">Port 53 UDP/TCP</div>
                  <div className="mt-2 text-[11px] text-[#8FA6B5]">Automated DKIM, SPF &amp; A records</div>
                </div>
              </div>
            )}

            {activeTab === "terminal" && (
              <div className="rounded bg-[#080C10] p-3 font-mono text-xs text-[#8FA6B5] space-y-1.5 overflow-x-auto">
                <div className="text-[#74B8CC]">$ clouddeck status</div>
                <div className="text-[#F4F8FA]">CloudDeck Host: lenovo (Ubuntu 24.04 LTS, x86_64)</div>
                <div>Memory Usage: 46.8 MB / 4050 MB (1.15%)</div>
                <div>Web Server: Nginx 1.24.0 (active, 14 vhosts loaded)</div>
                <div>Runtimes: PHP 8.1, 8.2, 8.3, 8.4, Node 22, Docker 26</div>
                <div>Database: MariaDB 10.11 (active, 6 databases provisioned)</div>
                <div className="text-[#10B981]">Security Status: Zero CVEs, WAF active, Fail2ban enabled</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
