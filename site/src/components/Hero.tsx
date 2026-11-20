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
  Lock,
  Cpu,
  Globe,
  Bot,
  Stethoscope,
  Key,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Activity,
  CheckCircle2,
} from "lucide-react";

export function Hero() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"deck" | "ai" | "php" | "apps" | "term">("deck");

  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <section id="top" className="relative overflow-hidden pt-10 pb-16 sm:pt-16 sm:pb-24">
      {/* Precision Ambient Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[550px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#38BDF8]/15 via-[#6366F1]/10 to-transparent blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-40 -left-40 -z-10 h-[380px] w-[380px] rounded-full bg-[#10B981]/10 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-40 -right-40 -z-10 h-[380px] w-[380px] rounded-full bg-[#6366F1]/15 blur-[100px]"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Pill Badge */}
        <div className="flex justify-center">
          <a
            href="#install"
            className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition hover:border-[#38BDF8]/40 hover:bg-white/10"
          >
            <span className="flex h-2 w-2 rounded-full bg-[#10B981] ring-4 ring-[#10B981]/20 animate-pulse" />
            <span className="font-semibold text-white">v0.6.54 STABLE</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 group-hover:text-white transition-colors">
              The AI-Native cPanel Replacement &bull; 8 AI Agents
            </span>
            <ArrowRight className="h-3 w-3 text-[#38BDF8] transition group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Hero Title */}
        <div className="mt-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.1] md:text-7xl">
            The modern hosting deck <br className="hidden sm:inline" />
            built for the{" "}
            <span className="bg-gradient-to-r from-[#38BDF8] via-[#60A5FA] to-[#A78BFA] bg-clip-text text-transparent">
              autonomous AI era
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base text-slate-400 sm:text-lg sm:leading-relaxed">
            Manage websites, multi-PHP (8.1–8.4), and production email while orchestrating{" "}
            <strong className="font-semibold text-slate-200">8 native AI coding agents</strong> and autonomous Site Doctor auto-fix — all from one elegant deck consuming{" "}
            <strong className="font-semibold text-[#10B981]">under 50MB of idle RAM</strong>{" "}
            with zero root web processes.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <a
            href="#install"
            className="flex items-center gap-2 rounded-full bg-[#38BDF8] px-6 py-3 text-sm font-bold text-[#080C10] shadow-lg shadow-[#38BDF8]/20 transition hover:bg-[#7DD3FC] hover:shadow-[#38BDF8]/30 hover:scale-[1.02]"
          >
            <span>Quick Install (~4 mins)</span>
            <ArrowRight className="h-4 w-4" />
          </a>

          <a
            href="#ai-agents"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-[#38BDF8]/40 hover:bg-white/10 hover:shadow-md"
          >
            <Bot className="h-4 w-4 text-[#38BDF8]" />
            <span>AI Agents &amp; Doctor</span>
            <span className="rounded-full bg-[#38BDF8]/20 px-2 py-0.5 text-[11px] font-mono font-bold text-[#38BDF8]">
              v0.6.54
            </span>
          </a>

          <a
            href="#local-dev"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <span>Local Dev</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-400">
              WSL 2 &bull; Mac
            </span>
          </a>
        </div>

        {/* 1-Click Terminal Command Bar */}
        <div className="mt-8 flex justify-center">
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0E141D] px-4 py-3 text-slate-200 shadow-2xl sm:px-5">
            <div className="flex items-center gap-3 overflow-hidden font-mono text-xs sm:text-sm">
              <span className="text-[#38BDF8] select-none font-bold">$</span>
              <span className="truncate text-slate-300">{installCommand}</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/10 hover:border-[#38BDF8]/30 transition"
              aria-label="Copy installation command"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#10B981]" />
                  <span className="text-[#10B981]">Copied!</span>
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
        <div className="mt-12 overflow-hidden rounded-2xl border border-white/10 bg-[#0B1017] shadow-2xl sm:rounded-3xl">
          {/* Mockup Window Chrome */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#080D13] px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[#EF4444]/80" />
              <div className="h-3 w-3 rounded-full bg-[#F59E0B]/80" />
              <div className="h-3 w-3 rounded-full bg-[#10B981]/80" />
              <div className="ml-3 hidden sm:flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 font-mono">
                <Lock className="h-3 w-3 text-[#10B981]" />
                <span>https://vps-nyc.clouddeck.local:2083</span>
              </div>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-2.5 py-0.5 text-[#10B981]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span className="font-semibold font-mono">42.4 MB Idle RAM</span>
              </div>
              <div className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#38BDF8]">
                <span>8 AI Agents</span>
              </div>
              <div className="hidden md:inline-block rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
                Zero-Root Active
              </div>
            </div>
          </div>

          {/* Interactive Feature Tabs */}
          <div className="flex overflow-x-auto no-scrollbar border-b border-white/10 bg-[#0C121A] px-2 sm:px-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("deck")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${
                activeTab === "deck"
                  ? "border-[#38BDF8] text-[#38BDF8]"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Overview Deck</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${
                activeTab === "ai"
                  ? "border-[#38BDF8] text-[#38BDF8]"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>AI Agents &amp; Doctor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("php")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${
                activeTab === "php"
                  ? "border-[#38BDF8] text-[#38BDF8]"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Multi-PHP (8.1–8.4)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("apps")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${
                activeTab === "apps"
                  ? "border-[#38BDF8] text-[#38BDF8]"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Polyglot Supervisor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("term")}
              className={`flex items-center gap-2 border-b-2 px-3 py-3 whitespace-nowrap transition ${
                activeTab === "term"
                  ? "border-[#38BDF8] text-[#38BDF8]"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Web Terminal PTY</span>
            </button>
          </div>

          {/* Interactive Tab Body */}
          <div className="p-4 sm:p-6 bg-[#090E15]">
            {activeTab === "deck" && (
              <div className="space-y-4">
                {/* 3 Stats Cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Memory Footprint</span>
                      <Cpu className="h-4 w-4 text-[#38BDF8]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">42.4 MB</div>
                    <div className="mt-1 text-xs text-[#10B981] font-medium">
                      30x lighter than cPanel (1.5GB)
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Active Virtual Hosts</span>
                      <Globe className="h-4 w-4 text-[#60A5FA]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">6 Online</div>
                    <div className="mt-1 text-xs text-[#38BDF8] font-medium">
                      Nginx 1.26 + Multi PHP-FPM
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Site Doctor Score</span>
                      <Stethoscope className="h-4 w-4 text-[#10B981]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold font-mono text-white">98 / 100</div>
                    <div className="mt-1 text-xs text-[#10B981] font-medium">
                      0 Defects &bull; Auto-Fix Ready
                    </div>
                  </div>
                </div>

                {/* Live Sites Table Preview */}
                <div className="rounded-xl border border-white/10 bg-[#0B1017] overflow-hidden">
                  <div className="border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-400 flex items-center justify-between">
                    <span>Provisioned Websites</span>
                    <span className="text-[11px] text-[#10B981] font-mono">All Systems Operational</span>
                  </div>
                  <div className="divide-y divide-white/5 text-xs">
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition">
                      <div className="flex items-center gap-2.5">
                        <Lock className="h-3.5 w-3.5 text-[#10B981]" />
                        <span className="font-semibold text-white">dakshraman.in</span>
                        <span className="hidden sm:inline text-slate-500 font-mono text-[11px]">/www/wwwroot/dakshraman.in</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2 py-0.5 text-[11px] font-mono text-[#38BDF8]">
                          PHP 8.4
                        </span>
                        <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-[11px] font-medium text-[#10B981]">
                          active
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition">
                      <div className="flex items-center gap-2.5">
                        <Lock className="h-3.5 w-3.5 text-[#10B981]" />
                        <span className="font-semibold text-white">api.clouddeck.io</span>
                        <span className="hidden sm:inline text-slate-500 font-mono text-[11px]">Next.js 16 Reverse Proxy</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-[#6366F1]/20 bg-[#6366F1]/10 px-2 py-0.5 text-[11px] font-mono text-[#818CF8]">
                          Node.js (Next.js)
                        </span>
                        <span className="rounded bg-[#10B981]/15 px-2 py-0.5 text-[11px] font-medium text-[#10B981]">
                          active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {/* Site Doctor Diagnostic Preview */}
                  <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Stethoscope className="h-4 w-4 text-[#10B981]" />
                        <span>Autonomous Site Doctor</span>
                      </div>
                      <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/15 px-2.5 py-0.5 font-bold font-mono text-[#10B981]">
                        Health: 98/100
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5">
                        <span className="text-slate-300">Nginx Virtual Host Syntax</span>
                        <span className="text-[#10B981] font-mono font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> PASS (nginx -t ok)
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5">
                        <span className="text-slate-300">TLS/SSL Expiration Check</span>
                        <span className="text-[#10B981] font-mono font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Valid (78 days remaining)
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5">
                        <span className="text-slate-300">Webroot Directory Permissions</span>
                        <span className="text-[#10B981] font-mono font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> www-data:www-data 0755
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-slate-400">
                      <span>Autonomous Self-Healing</span>
                      <span className="text-[#38BDF8] font-bold">1-Click Auto-Fix Enabled</span>
                    </div>
                  </div>

                  {/* AI Key Vault & Terminal Injection */}
                  <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Key className="h-4 w-4 text-[#38BDF8]" />
                        <span>Encrypted AI Key Vault</span>
                      </div>
                      <span className="rounded-full border border-[#38BDF8]/30 bg-[#38BDF8]/10 px-2 py-0.5 font-mono text-[10px] text-[#38BDF8]">
                        Mode 0600 Secure
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5 font-mono">
                        <span className="text-slate-300">ANTHROPIC_API_KEY</span>
                        <span className="text-slate-500">sk-ant-••••••••••••</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5 font-mono">
                        <span className="text-slate-300">OPENAI_API_KEY</span>
                        <span className="text-slate-500">sk-proj-••••••••••••</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3 py-2 border border-white/5 font-mono">
                        <span className="text-slate-300">OLLAMA_HOST</span>
                        <span className="text-[#10B981]">http://127.0.0.1:11434</span>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                      Masked secrets &bull; Auto-exported into web terminal environment
                    </div>
                  </div>
                </div>

                {/* 8 AI Coding Agents Grid */}
                <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4 text-xs">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-white text-xs uppercase tracking-wider">
                      8 Supported Native AI Coding Agents
                    </span>
                    <span className="text-[11px] text-[#38BDF8]">
                      Launch inside Web Terminal with 1 click
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { name: "Claude Code", model: "Anthropic Opus/Sonnet", status: "Installed" },
                      { name: "OpenAI Codex", model: "GPT-4o Agentic", status: "Ready" },
                      { name: "Google Antigravity", model: "Gemini CLI / SDK", status: "Installed" },
                      { name: "Ollama (Offline)", model: "Llama 3 / DeepSeek", status: "Local Engine" },
                      { name: "Aider", model: "Multi-model Git Pair", status: "Ready" },
                      { name: "OpenCode", model: "Self-Hosted Agent", status: "Ready" },
                      { name: "Goose", model: "Block Open Agent", status: "Ready" },
                      { name: "Hermes Agent", model: "Nous Research Core", status: "Ready" },
                    ].map((agent) => (
                      <div
                        key={agent.name}
                        className="rounded-lg border border-white/5 bg-[#080D13] p-2.5 hover:border-[#38BDF8]/30 transition"
                      >
                        <div className="font-bold text-white truncate">{agent.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{agent.model}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#10B981]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          <span>{agent.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "php" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4 text-xs">
                  <div className="text-sm font-bold text-white">
                    Isolated Multi-PHP Sockets (Coexistence) &bull; Extensions &amp; Visual php.ini
                  </div>
                  <p className="mt-1 text-slate-400">
                    Run PHP 8.1, 8.2, 8.3, and 8.4 simultaneously on bare metal without Docker overhead.
                    1-click toggle extensions (redis, opcache, imagick) and visually tune memory and upload limits.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {["PHP 8.1 FPM", "PHP 8.2 FPM", "PHP 8.3 FPM", "PHP 8.4 FPM"].map((v, i) => (
                      <div
                        key={v}
                        className="rounded-xl border border-white/10 bg-[#080D13] p-3 text-center hover:border-[#38BDF8]/30 transition"
                      >
                        <div className="font-bold text-white">{v}</div>
                        <div className="mt-1 text-[11px] font-mono text-[#10B981]">
                          /run/php/php{["8.1", "8.2", "8.3", "8.4"][i]}-fpm.sock
                        </div>
                        <div className="mt-2 text-[10px] text-slate-400">Visual php.ini Editor</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "apps" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#0E141D] p-4 text-xs">
                  <div className="text-sm font-bold text-white">
                    Polyglot Application Supervision
                  </div>
                  <p className="mt-1 text-slate-400">
                    Deploy Node.js, Python, Go, Ruby, and custom binaries. CloudDeck manages port
                    allocation, systemd process supervision, auto-restart on crash, and reverse proxying.
                  </p>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3.5 py-2.5 border border-white/5">
                      <span className="font-mono text-white">web-frontend (Next.js 16)</span>
                      <span className="text-[#38BDF8] font-mono text-xs">Port 3000 &bull; systemd active</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3.5 py-2.5 border border-white/5">
                      <span className="font-mono text-white">ai-worker (Python FastAPI)</span>
                      <span className="text-[#38BDF8] font-mono text-xs">Port 8000 &bull; systemd active</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#080D13] px-3.5 py-2.5 border border-white/5">
                      <span className="font-mono text-white">core-api (Go Stdlib)</span>
                      <span className="text-[#38BDF8] font-mono text-xs">Port 9091 &bull; systemd active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "term" && (
              <div className="rounded-xl border border-white/10 bg-[#080D13] p-4 font-mono text-xs text-slate-300">
                <div className="text-slate-500">clouddeck@vps-nyc3:~$ clouddeck status</div>
                <div className="mt-2 text-[#10B981]">
                  [✓] CloudDeck Agent: active (pid 1420, 127.0.0.1:9090)
                </div>
                <div className="text-[#10B981]">
                  [✓] CloudDeck Panel: active (pid 1485, port 2083) [Next.js 16.4.6]
                </div>
                <div className="text-[#38BDF8]">
                  [✓] Memory Footprint: 42.4 MB / 1024 MB (4.1% utilization)
                </div>
                <div className="text-[#818CF8]">
                  [✓] AI Key Vault: 5 API keys decrypted &amp; auto-injected into shell
                </div>
                <div className="text-[#10B981]">
                  [✓] Site Doctor: 0 defects detected across all vhosts
                </div>
                <div className="mt-3 text-slate-500">
                  clouddeck@vps-nyc3:~$ claude --version<br />
                  <span className="text-white">claude-code v0.6.54 (ready to pair-program on your server)</span><br />
                  clouddeck@vps-nyc3:~$ <span className="animate-pulse text-[#38BDF8]">_</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
