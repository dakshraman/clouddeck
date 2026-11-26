"use client";

import { useState } from "react";
import { Copy, Check, Server, Laptop, Apple } from "lucide-react";

export function InstallSection() {
  const [platform, setPlatform] = useState<"linux" | "mac" | "win">("linux");
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const linuxCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";
  const winCmd = "irm https://clouddeck.dakshraman.in/install.ps1 | iex";
  const macCmd = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash";

  return (
    <section id="install" className="border-t border-white/10 bg-[#080C10] py-16 sm:py-24 relative">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>Universal Installer</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Single installer. Automatic platform detection
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            The installer automatically detects Linux, macOS, or Windows WSL 2,
            configures your LEMP stack, and sets up panel SSL certificates.
          </p>
        </div>

        {/* Platform Selector Tabs */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex flex-wrap justify-center rounded-lg border border-white/10 bg-[#0D131A] p-1 shadow-subtle">
            <button
              type="button"
              onClick={() => setPlatform("linux")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                platform === "linux"
                  ? "bg-[#121A22] text-[#F4F8FA] border border-white/10 shadow-sm"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Server className="h-3.5 w-3.5 text-[#74B8CC]" />
              <span>Linux Server (Ubuntu / Debian)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("mac")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                platform === "mac"
                  ? "bg-[#121A22] text-[#F4F8FA] border border-white/10 shadow-sm"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Apple className="h-3.5 w-3.5 text-[#74B8CC]" />
              <span>macOS (Apple Silicon &amp; Intel)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("win")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                platform === "win"
                  ? "bg-[#121A22] text-[#F4F8FA] border border-white/10 shadow-sm"
                  : "text-[#8FA6B5] hover:text-[#F4F8FA]"
              }`}
            >
              <Laptop className="h-3.5 w-3.5 text-[#74B8CC]" />
              <span>Windows (WSL 2)</span>
            </button>
          </div>
        </div>

        {/* Code Box */}
        <div className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-[#101720] shadow-subtle">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0D141C] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="ml-2 font-mono text-xs text-[#8FA6B5]">
                {platform === "linux"
                  ? "bash (root / sudo required)"
                  : platform === "win"
                  ? "powershell (Administrator)"
                  : "zsh (Terminal)"}
              </span>
            </div>
            <span className="text-xs font-mono text-[#74B8CC]">
              {platform === "linux" ? "Production VPS" : "Workstation Development"}
            </span>
          </div>

          {/* Terminal Body */}
          <div className="p-5 font-mono text-xs sm:text-sm">
            {platform === "linux" && (
              <div className="space-y-3">
                <div className="text-[#546C7B]">
                  # Automated Linux VPS Installer (Ubuntu 20.04/22.04/24.04, Debian 11/12)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0A0E13] p-3.5">
                  <span className="text-[#F4F8FA] select-all break-all">{linuxCommand}</span>
                  <button
                    type="button"
                    onClick={() => copyText(linuxCommand, "linux")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
                    aria-label="Copy Linux installation command"
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
              <div className="space-y-3">
                <div className="text-[#546C7B]">
                  # Native macOS Installer via Homebrew (Apple Silicon M1–M4 &amp; Intel)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0A0E13] p-3.5">
                  <span className="text-[#F4F8FA] select-all break-all">{macCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(macCmd, "mac")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
                    aria-label="Copy macOS installation command"
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
              <div className="space-y-3">
                <div className="text-[#546C7B]">
                  # Windows 10/11 WSL 2 Automated Installer (PowerShell)
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0A0E13] p-3.5">
                  <span className="text-[#FAAA93] select-all break-all">{winCmd}</span>
                  <button
                    type="button"
                    onClick={() => copyText(winCmd, "win")}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
                    aria-label="Copy Windows installation command"
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
          <div className="rounded-lg border border-white/10 bg-[#101720] p-3.5 text-center">
            <div className="text-[11px] font-mono text-[#8FA6B5]">Min Memory</div>
            <div className="mt-1 text-base font-semibold font-mono text-[#F4F8FA]">512 MB RAM</div>
            <div className="mt-0.5 text-[11px] text-[#10B981]">Low-footprint ready</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#101720] p-3.5 text-center">
            <div className="text-[11px] font-mono text-[#8FA6B5]">Supported OS</div>
            <div className="mt-1 text-base font-semibold font-mono text-[#F4F8FA]">Ubuntu &amp; Debian</div>
            <div className="mt-0.5 text-[11px] text-[#8FA6B5]">x86_64 &amp; arm64</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#101720] p-3.5 text-center">
            <div className="text-[11px] font-mono text-[#8FA6B5]">Web Security</div>
            <div className="mt-1 text-base font-semibold font-mono text-[#F4F8FA]">Zero-Root</div>
            <div className="mt-0.5 text-[11px] text-[#10B981]">Unprivileged UI</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#101720] p-3.5 text-center">
            <div className="text-[11px] font-mono text-[#8FA6B5]">License</div>
            <div className="mt-1 text-base font-semibold font-mono text-[#F4F8FA]">MIT License</div>
            <div className="mt-0.5 text-[11px] text-[#74B8CC]">100% Free &amp; Open Source</div>
          </div>
        </div>
      </div>
    </section>
  );
}
