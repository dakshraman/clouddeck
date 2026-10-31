"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Server, Laptop, Apple, Zap, Sparkles, CheckCircle2 } from "lucide-react";

export function InstallSection() {
  const [platform, setPlatform] = useState<"linux" | "win" | "mac">("linux");
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const universalCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash";
  const linuxCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";
  const winCmd = "irm https://clouddeck.dakshraman.in/install.ps1 | iex";
  const macCmd = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash";

  return (
    <section id="install" className="border-t border-[#D2ADAC]/40 bg-[#FAF7F5] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#235361]">
            <Sparkles className="h-3.5 w-3.5 text-[#FAAA93]" />
            <span>Single Unified Cross-Platform Installer</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            One script. <span className="text-[#235361]">Auto-detected OS</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            No more hunting for separate scripts. The unified installer detects Linux, macOS, or Windows WSL,
            launches an interactive Uni-themed terminal selector, and provisions your complete stack in minutes.
          </p>
        </div>

        {/* Platform Selector Tabs */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-[#D2ADAC]/60 bg-white/80 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setPlatform("linux")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "linux"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Linux Server (Ubuntu / Debian / RHEL)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("mac")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "mac"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              <Apple className="h-3.5 w-3.5" />
              <span>macOS (Apple Silicon & Intel)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("win")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "win"
                  ? "bg-[#235361] text-[#74B8CC] shadow-sm"
                  : "text-[#566E76] hover:text-[#14242B]"
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Windows (WSL 2)</span>
            </button>
          </div>
        </div>

        {/* Code Box */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-[#D2ADAC]/60 bg-[#122228] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0C171C] px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FF5F56]" />
              <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
              <span className="h-3 w-3 rounded-full bg-[#27C93F]" />
              <span className="ml-3 font-mono text-xs text-[#9BB2BA]">
                {platform === "linux"
                  ? "bash (root / sudo)"
                  : platform === "win"
                  ? "powershell (Administrator)"
                  : "zsh (Terminal)"}
              </span>
            </div>
            <span className="text-xs font-semibold text-[#74B8CC]">
              {platform === "linux" ? "Production VPS" : "Local Development Suite"}
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-5 sm:p-7">
            {platform === "linux" && (
              <div className="space-y-6">
                <div>
                  <div className="text-xs font-semibold text-[#9BB2BA]">
                    # One-line universal installer with interactive component selection:
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#0C171C] p-3.5 text-white font-mono text-xs sm:text-sm">
                    <span className="truncate text-[#74B8CC]">{linuxCommand}</span>
                    <button
                      type="button"
                      onClick={() => copyText(linuxCommand, "lin-cmd")}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
                    >
                      {copied === "lin-cmd" ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied === "lin-cmd" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Terminal Preview */}
                <div className="rounded-xl border border-white/10 bg-[#0A1317] p-4 font-mono text-xs text-[#9BB2BA]">
                  <div className="text-[#74B8CC] font-bold">┌─ Choose Installation Profile ─────────────────────────────────────────────┐</div>
                  <div className="text-[#9BB2BA]">│  <span className="text-[#FAAA93] font-bold">[1] Recommended Full LEMP Stack</span> (Default) Nginx + MariaDB + Multi-PHP │</div>
                  <div className="text-[#9BB2BA]">│  <span className="text-[#FAAA93] font-bold">[2] Fast Core Development Suite</span> (60s) Nginx + MariaDB + PHP 8.4 + Node.js  │</div>
                  <div className="text-[#9BB2BA]">│  <span className="text-[#FAAA93] font-bold">[3] Custom Component Selection</span> (Interactive checklist: toggle each)    │</div>
                  <div className="text-[#9BB2BA]">│  <span className="text-[#FAAA93] font-bold">[4] Minimal Deck Only</span> (Panel + Agent + CLI only)                      │</div>
                  <div className="text-[#74B8CC] font-bold">└───────────────────────────────────────────────────────────────────────────┘</div>
                </div>

                {/* VPS Optimizations Callout */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 text-xs text-[#9BB2BA]">
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Auto-Swapfile:</span> Creates 1GB swap
                    automatically on &lt;2GB RAM servers to eliminate OOM kills.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Interactive UI:</span> Select profile or
                    toggle Nginx, MariaDB, PHP 8.1-8.4, Email, and DNS.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Parallel Fetch:</span> Background
                    asset downloads parallelized with package setup.
                  </div>
                </div>
              </div>
            )}

            {platform === "mac" && (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-[#9BB2BA]">
                  # One-line universal installer for macOS (Apple Silicon M1/M2/M3/M4 & Intel):
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0C171C] p-3.5 text-white font-mono text-xs sm:text-sm">
                  <span className="truncate text-[#74B8CC]">{macCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(macCmd, "mac")}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
                  >
                    {copied === "mac" ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === "mac" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 text-xs text-[#9BB2BA]">
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Homebrew LEMP:</span> Nginx, MariaDB,
                    PHP 8.4, and Node.js managed via brew services.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Green Padlocks:</span> Local Root CA
                    automatically added to macOS System Keychain.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Native CLI:</span> Run <code>clouddeck</code>
                    from Terminal to link projects and manage sites.
                  </div>
                </div>
              </div>
            )}

            {platform === "win" && (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-[#9BB2BA]">
                  # Run in PowerShell as Administrator (or in WSL/Git Bash with install.sh):
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0C171C] p-3.5 text-white font-mono text-xs sm:text-sm">
                  <span className="truncate text-[#FAAA93]">{winCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(winCmd, "win")}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
                  >
                    {copied === "win" ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === "win" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 text-xs text-[#9BB2BA]">
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">WSL 2 Integration:</span> Auto-provisions
                    Ubuntu inside WSL with systemd enabled.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Windows CA Trust:</span> Imports Local
                    CA into Windows Certificate Store for Chrome/Edge.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Native Windows CLI:</span> Access
                    <code>clouddeck</code> directly from PowerShell and CMD.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Post-Install Info Pills */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-[#566E76]">
          <span className="flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/80 px-3.5 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#235361]" />
            <span>Web Panel binds on port 2083</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/80 px-3.5 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#235361]" />
            <span>Zero root web processes</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/80 px-3.5 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#235361]" />
            <span>CLI tool linked automatically to PATH</span>
          </span>
        </div>
      </div>
    </section>
  );
}
