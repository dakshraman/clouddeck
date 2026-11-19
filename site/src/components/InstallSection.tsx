"use client";

import { useState } from "react";
import { Copy, Check, Terminal, Server, Laptop, Apple, Zap, Sparkles, CheckCircle2 } from "lucide-react";

export function InstallSection() {
  const [platform, setPlatform] = useState<"linux" | "mac" | "win">("linux");
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
    <section id="install" className="border-t border-white/5 bg-[#080C10] py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-semibold text-[#38BDF8]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>CROSS-PLATFORM UNIFIED INSTALLER</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            One script. <span className="text-[#38BDF8]">Auto-detected OS</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            The installer automatically detects Linux, macOS, or Windows WSL 2,
            provisions your complete LEMP stack and AI agents, and configures SSL in minutes.
          </p>
        </div>

        {/* Platform Selector Tabs */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-2xl sm:rounded-full border border-white/10 bg-[#0C121A] p-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => setPlatform("linux")}
              className={`flex items-center gap-2 rounded-xl sm:rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "linux"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Linux VPS (Ubuntu / Debian / RHEL)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("mac")}
              className={`flex items-center gap-2 rounded-xl sm:rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "mac"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Apple className="h-3.5 w-3.5" />
              <span>macOS (Apple Silicon &amp; Intel)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("win")}
              className={`flex items-center gap-2 rounded-xl sm:rounded-full px-5 py-2 text-xs font-bold transition ${
                platform === "win"
                  ? "bg-[#38BDF8] text-[#080C10] shadow-md shadow-[#38BDF8]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Windows (WSL 2)</span>
            </button>
          </div>
        </div>

        {/* Code Box */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0B1017] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#080D13] px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#EF4444]/80" />
              <span className="h-3 w-3 rounded-full bg-[#F59E0B]/80" />
              <span className="h-3 w-3 rounded-full bg-[#10B981]/80" />
              <span className="ml-3 font-mono text-xs text-slate-400">
                {platform === "linux"
                  ? "bash (root / sudo)"
                  : platform === "win"
                  ? "powershell (Administrator)"
                  : "zsh (Terminal)"}
              </span>
            </div>
            <span className="text-xs font-mono text-[#38BDF8]">
              {platform === "linux" ? "Production VPS" : "Local Development Suite"}
            </span>
          </div>

          {/* Terminal Body */}
          <div className="p-6 font-mono text-xs sm:text-sm">
            {platform === "linux" && (
              <div className="space-y-4">
                <div className="text-slate-500">
                  # Automated Linux VPS Installer (Ubuntu 20.04/22.04/24.04, Debian 11/12)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080D13] p-4">
                  <span className="text-[#38BDF8] select-all break-all">{linuxCommand}</span>
                  <button
                    type="button"
                    onClick={() => copyText(linuxCommand, "linux")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                    aria-label="Copy Linux command"
                  >
                    {copied === "linux" ? (
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
            )}

            {platform === "mac" && (
              <div className="space-y-4">
                <div className="text-slate-500">
                  # Native macOS Installer via Homebrew (Apple Silicon M1-M4 &amp; Intel)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080D13] p-4">
                  <span className="text-[#38BDF8] select-all break-all">{macCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(macCmd, "mac")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                    aria-label="Copy macOS command"
                  >
                    {copied === "mac" ? (
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
            )}

            {platform === "win" && (
              <div className="space-y-4">
                <div className="text-slate-500">
                  # Windows 10/11 WSL 2 Automated Installer (PowerShell)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080D13] p-4">
                  <span className="text-amber-400 select-all break-all">{winCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(winCmd, "win")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                    aria-label="Copy Windows command"
                  >
                    {copied === "win" ? (
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
            )}
          </div>
        </div>

        {/* Hardware & System Prerequisites */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#0C121A] p-4 text-center">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Min Memory</div>
            <div className="mt-1 text-lg font-bold font-mono text-white">512 MB RAM</div>
            <div className="mt-0.5 text-[11px] text-[#10B981]">Runs on $3.50/mo VPS</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0C121A] p-4 text-center">
            <div className="text-[11px] font-mono text-slate-500 uppercase">CPU Requirement</div>
            <div className="mt-1 text-lg font-bold font-mono text-white">1 vCPU</div>
            <div className="mt-0.5 text-[11px] text-[#38BDF8]">x86_64 &amp; arm64</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0C121A] p-4 text-center">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Web Ports</div>
            <div className="mt-1 text-lg font-bold font-mono text-white">2083 / 80 / 443</div>
            <div className="mt-0.5 text-[11px] text-slate-400">1-Click Auto SSL</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0C121A] p-4 text-center">
            <div className="text-[11px] font-mono text-slate-500 uppercase">License Cost</div>
            <div className="mt-1 text-lg font-bold font-mono text-[#10B981]">$0 / Free</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Open Source MIT</div>
          </div>
        </div>
      </div>
    </section>
  );
}
