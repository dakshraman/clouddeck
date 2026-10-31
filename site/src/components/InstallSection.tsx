"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Server, Laptop, Apple, Zap, Sparkles } from "lucide-react";

export function InstallSection() {
  const [platform, setPlatform] = useState<"linux" | "win" | "mac">("linux");
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const linuxStandard = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";
  const linuxFast = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash -s -- --fast";
  const winCmd = "irm https://clouddeck.dakshraman.in/install.ps1 | iex";
  const macCmd = "curl -fsSL https://clouddeck.dakshraman.in/install-macos.sh | bash";

  return (
    <section id="install" className="border-t border-[#D2ADAC]/40 bg-[#FAF7F5] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#235361]">
            <Sparkles className="h-3.5 w-3.5 text-[#FAAA93]" />
            <span>1-Command Deployment</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Up and running in <span className="text-[#235361]">under 4 minutes</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            Choose your environment. The automated installer provisions the native LEMP stack,
            configures hardened systemd units, and hands you an active deck at port 2083.
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
              <span>Linux VPS (Ubuntu / Debian)</span>
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
              <span>macOS Workstation</span>
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
              {platform === "linux" ? "Production VPS" : "Local Dev Suite"}
            </span>
          </div>

          {/* Terminal Content */}
          <div className="p-5 sm:p-7">
            {platform === "linux" && (
              <div className="space-y-6">
                <div>
                  <div className="text-xs font-semibold text-[#9BB2BA]">
                    # Recommended: Standard Full Installation (~4 mins)
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#0C171C] p-3.5 text-white font-mono text-xs sm:text-sm">
                    <span className="truncate text-[#74B8CC]">{linuxStandard}</span>
                    <button
                      type="button"
                      onClick={() => copyText(linuxStandard, "lin-std")}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
                    >
                      {copied === "lin-std" ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied === "lin-std" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#9BB2BA]">
                    # Fast Minimal Core LEMP for Low-Spec / Budget VPS (~60s)
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#0C171C] p-3.5 text-white font-mono text-xs sm:text-sm">
                    <span className="truncate text-[#FAAA93]">{linuxFast}</span>
                    <button
                      type="button"
                      onClick={() => copyText(linuxFast, "lin-fast")}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
                    >
                      {copied === "lin-fast" ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied === "lin-fast" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                {/* VPS Optimizations Callout */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 text-xs text-[#9BB2BA]">
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Auto-Swapfile:</span> Creates 1GB swap
                    automatically on &lt;2GB RAM servers to eliminate OOM kills.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">APT Acceleration:</span> Suppresses
                    slow man-db locks with streamlined package fetching.
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#182D35]/50 p-3">
                    <span className="font-bold text-white">Parallel Fetch:</span> Background
                    asset downloads parallelized with package setup.
                  </div>
                </div>
              </div>
            )}

            {platform === "win" && (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-[#9BB2BA]">
                  # Run in PowerShell as Administrator:
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
                <p className="text-xs text-[#9BB2BA] leading-relaxed">
                  Provisions core LEMP inside WSL 2 with systemd, adds <code className="text-[#74B8CC]">clouddeck</code> to your Windows PATH,
                  and trusts the Local Root CA into Windows Certificate Store for green padlocks on <code className="text-[#FAAA93]">https://*.local</code>.
                </p>
              </div>
            )}

            {platform === "mac" && (
              <div className="space-y-4">
                <div className="text-xs font-semibold text-[#9BB2BA]">
                  # Run in macOS Terminal:
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
                <p className="text-xs text-[#9BB2BA] leading-relaxed">
                  Apple Silicon (M1–M4) and Intel native. Manages Nginx, MariaDB, and PHP via Homebrew, supervised cleanly by <code className="text-[#74B8CC]">launchctl</code> LaunchAgents.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

