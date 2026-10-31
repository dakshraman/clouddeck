"use client";

import { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  Shield,
  Zap,
  Server,
  Layers,
  ArrowRight,
  ExternalLink,
  Lock,
  Cpu,
  HardDrive,
  Database,
  Globe,
  Radio,
} from "lucide-react";

export function Hero() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"deck" | "php" | "apps" | "term">("deck");

  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section id="top" className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24">
      {/* Uni Ambient Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-12 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#74B8CC]/20 via-[#FAAA93]/15 to-[#235361]/20 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/4 -z-10 h-[350px] w-[350px] rounded-full bg-[#74B8CC]/20 blur-[80px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-40 right-1/4 -z-10 h-[320px] w-[320px] rounded-full bg-[#FAAA93]/25 blur-[90px]"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Pill Badge */}
        <div className="flex justify-center">
          <a
            href="#install"
            className="group flex items-center gap-2 rounded-full border border-[#D2ADAC]/60 bg-white/80 px-3.5 py-1 text-xs font-medium text-[#235361] shadow-sm backdrop-blur transition hover:border-[#6494AC] hover:bg-white"
          >
            <span className="flex h-2 w-2 rounded-full bg-[#38BD87] ring-4 ring-[#38BD87]/20" />
            <span className="font-semibold text-[#14242B]">LATEST STABLE RELEASE</span>
            <span className="text-[#886351]">•</span>
            <span className="text-[#566E76] group-hover:text-[#235361]">
              The Modern cPanel Alternative
            </span>
            <ArrowRight className="h-3 w-3 text-[#6494AC] transition group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Hero Title */}
        <div className="mt-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#14242B] sm:text-6xl sm:leading-[1.1] md:text-7xl">
            The modern hosting deck <br className="hidden sm:inline" />
            built to <span className="text-[#235361] underline decoration-[#FAAA93] decoration-wavy decoration-2 underline-offset-8">replace cPanel</span>.
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base text-[#566E76] sm:text-xl sm:leading-relaxed">
            Websites, multi-PHP (8.1–8.4), polyglot app runtimes, MariaDB, Postfix/Dovecot email,
            and PowerDNS — all from one elegant deck consuming{" "}
            <strong className="font-semibold text-[#14242B]">under 50MB of idle RAM</strong>{" "}
            without ever exposing a root process to the browser.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <a
            href="#install"
            className="flex items-center gap-2 rounded-full bg-[#FAAA93] px-6 py-3 text-sm font-bold text-[#14242B] shadow-sm transition hover:bg-[#fa9e85] hover:shadow-lg hover:shadow-[#FAAA93]/25"
          >
            <span>Quick Install (~4 mins)</span>
            <ArrowRight className="h-4 w-4" />
          </a>

          <a
            href="#local-dev"
            className="flex items-center gap-2 rounded-full border border-[#D2ADAC]/80 bg-white/90 px-6 py-3 text-sm font-semibold text-[#235361] shadow-sm transition hover:border-[#6494AC] hover:bg-white hover:shadow-md"
          >
            <span>Local Dev Suite</span>
            <span className="rounded-full bg-[#74B8CC]/20 px-2 py-0.5 text-[11px] font-bold text-[#235361]">
              WSL 2 &amp; macOS
            </span>
          </a>

          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-[#D2ADAC]/60 bg-white/60 px-5 py-3 text-sm font-medium text-[#566E76] transition hover:border-[#6494AC] hover:bg-white hover:text-[#14242B]"
          >
            <Globe className="h-4 w-4 text-[#6494AC]" />
            <span>100% Open Source ($0)</span>
          </a>
        </div>

        {/* 1-Click Terminal Command Bar */}
        <div className="mt-8 flex justify-center">
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-[#D2ADAC]/60 bg-[#122228] px-4 py-3 text-[#F4F8FA] shadow-xl sm:px-5">
            <div className="flex items-center gap-3 overflow-hidden font-mono text-xs sm:text-sm">
              <span className="text-[#FAAA93]">$</span>
              <span className="truncate text-[#74B8CC]">{installCommand}</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#74B8CC]/30 bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] transition hover:bg-[#235361] hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#38BD87]" />
                  <span className="text-[#38BD87]">Copied!</span>
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

        {/* Interactive Deck Mockup Frame */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-[#D2ADAC]/60 bg-[#122228] text-white shadow-2xl sm:rounded-3xl">
          {/* Mockup Window Chrome */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#0C171C] px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[#FF5F56]" />
              <div className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
              <div className="h-3 w-3 rounded-full bg-[#27C93F]" />
              <div className="ml-3 hidden items-center gap-1.5 rounded-md bg-[#182D35] px-2.5 py-1 text-xs text-[#9BB2BA] sm:flex">
                <Lock className="h-3 w-3 text-[#38BD87]" />
                <span>https://vps-nyc.clouddeck.local:2083</span>
              </div>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 rounded-full bg-[#38BD87]/15 px-2.5 py-0.5 text-[#38BD87]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#38BD87] animate-pulse" />
                <span className="font-semibold">42 MB Idle RAM</span>
              </div>
              <div className="hidden rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 font-medium text-[#74B8CC] sm:inline-block">
                Zero-Root Active
              </div>
            </div>
          </div>

          {/* Interactive Feature Tabs */}
          <div className="flex overflow-x-auto border-b border-white/10 bg-[#14242B] px-4 text-xs font-semibold sm:px-6">
            <button
              type="button"
              onClick={() => setActiveTab("deck")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${activeTab === "deck"
                  ? "border-[#74B8CC] text-[#74B8CC]"
                  : "border-transparent text-[#9BB2BA] hover:text-white"
                }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Overview Deck</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("php")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${activeTab === "php"
                  ? "border-[#74B8CC] text-[#74B8CC]"
                  : "border-transparent text-[#9BB2BA] hover:text-white"
                }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Multi-PHP (8.1–8.4)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("apps")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${activeTab === "apps"
                  ? "border-[#74B8CC] text-[#74B8CC]"
                  : "border-transparent text-[#9BB2BA] hover:text-white"
                }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Polyglot Supervisor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("term")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${activeTab === "term"
                  ? "border-[#74B8CC] text-[#74B8CC]"
                  : "border-transparent text-[#9BB2BA] hover:text-white"
                }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Web Terminal PTY</span>
            </button>
          </div>

          {/* Interactive Tab Body */}
          <div className="p-4 sm:p-6">
            {activeTab === "deck" && (
              <div className="space-y-4">
                {/* 3 Stats Cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-[#182D35]/50 p-4">
                    <div className="flex items-center justify-between text-xs text-[#9BB2BA]">
                      <span>Memory Footprint</span>
                      <Cpu className="h-4 w-4 text-[#74B8CC]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">42.4 MB</div>
                    <div className="mt-1 text-xs text-[#38BD87]">
                      30x lighter than cPanel (1.5GB)
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#182D35]/50 p-4">
                    <div className="flex items-center justify-between text-xs text-[#9BB2BA]">
                      <span>Active Websites</span>
                      <Globe className="h-4 w-4 text-[#FAAA93]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">6 Online</div>
                    <div className="mt-1 text-xs text-[#74B8CC]">
                      Nginx 1.26 + Multi PHP-FPM
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#182D35]/50 p-4">
                    <div className="flex items-center justify-between text-xs text-[#9BB2BA]">
                      <span>Security &amp; SSL</span>
                      <Shield className="h-4 w-4 text-[#38BD87]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">100% Secured</div>
                    <div className="mt-1 text-xs text-[#9BB2BA]">
                      Auto Let&apos;s Encrypt &amp; Panel SSL
                    </div>
                  </div>
                </div>

                {/* Live Sites Table Preview */}
                <div className="rounded-xl border border-white/10 bg-[#0C171C] overflow-hidden">
                  <div className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-[#9BB2BA]">
                    Provisional Websites
                  </div>
                  <div className="divide-y divide-white/5 text-xs">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-[#38BD87]" />
                        <span className="font-semibold text-white">dakshraman.in</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#235361] px-2 py-0.5 text-[11px] font-medium text-[#74B8CC]">
                          PHP 8.4
                        </span>
                        <span className="rounded bg-[#38BD87]/15 px-2 py-0.5 text-[11px] text-[#38BD87]">
                          active
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-[#38BD87]" />
                        <span className="font-semibold text-white">api.clouddeck.io</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#886351]/40 px-2 py-0.5 text-[11px] font-medium text-[#FAAA93]">
                          Node.js (Next.js)
                        </span>
                        <span className="rounded bg-[#38BD87]/15 px-2 py-0.5 text-[11px] text-[#38BD87]">
                          active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "php" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#0C171C] p-4 text-xs">
                  <div className="text-sm font-bold text-[#74B8CC]">
                    Isolated Multi-PHP Sockets (Coexistence)
                  </div>
                  <p className="mt-1 text-[#9BB2BA]">
                    Run PHP 8.1, 8.2, 8.3, and 8.4 simultaneously on the same machine without
                    Docker. Each website gets its own Unix domain socket.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {["PHP 8.1 FPM", "PHP 8.2 FPM", "PHP 8.3 FPM", "PHP 8.4 FPM"].map((v, i) => (
                      <div
                        key={v}
                        className="rounded-lg border border-[#74B8CC]/30 bg-[#182D35] p-3 text-center"
                      >
                        <div className="font-bold text-white">{v}</div>
                        <div className="mt-1 text-[11px] text-[#38BD87]">
                          /run/php/php{["8.1", "8.2", "8.3", "8.4"][i]}-fpm.sock
                        </div>
                        <div className="mt-2 text-[10px] text-[#9BB2BA]">Coexisting</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "apps" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#0C171C] p-4 text-xs">
                  <div className="text-sm font-bold text-[#FAAA93]">
                    Polyglot Application Supervision
                  </div>
                  <p className="mt-1 text-[#9BB2BA]">
                    Deploy Node.js, Python, Go, Ruby, and custom binaries. CloudDeck handles port
                    allocation, systemd process supervision, and reverse proxying.
                  </p>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-[#182D35] px-3 py-2">
                      <span className="font-mono text-white">web-frontend (Next.js)</span>
                      <span className="text-[#74B8CC]">Port 3000 • systemd active</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#182D35] px-3 py-2">
                      <span className="font-mono text-white">ai-worker (Python FastAPI)</span>
                      <span className="text-[#74B8CC]">Port 8000 • systemd active</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#182D35] px-3 py-2">
                      <span className="font-mono text-white">core-api (Go Stdlib)</span>
                      <span className="text-[#74B8CC]">Port 9091 • systemd active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "term" && (
              <div className="rounded-xl border border-white/10 bg-[#0C171C] p-4 font-mono text-xs">
                <div className="text-[#9BB2BA]">clouddeck@vps-nyc3:~$ clouddeck status</div>
                <div className="mt-2 text-[#38BD87]">
                  [✓] CloudDeck Agent: active (pid 1420, 127.0.0.1:9090)
                </div>
                <div className="text-[#38BD87]">
                  [✓] CloudDeck Panel: active (pid 1485, port 2083)
                </div>
                <div className="text-[#74B8CC]">
                  [✓] Memory: 42.4 MB / 1024 MB (4.1% utilization)
                </div>
                <div className="text-[#FAAA93]">
                  [✓] 1-Click Panel SSL: Enabled (IP SANs: 198.51.100.22)
                </div>
                <div className="mt-2 text-[#9BB2BA]">
                  clouddeck@vps-nyc3:~$ <span className="animate-pulse">_</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

