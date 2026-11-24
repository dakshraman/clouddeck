"use client";

import { useState } from "react";
import { Copy, Check, Apple, Laptop, ShieldCheck, FolderSync, Zap } from "lucide-react";

export function LocalDevSuite() {
  const [copiedWin, setCopiedWin] = useState(false);
  const [copiedMac, setCopiedMac] = useState(false);

  const winCmd = "irm https://clouddeck.dakshraman.in/install.ps1 | iex";
  const macCmd = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash";

  const copyWin = async () => {
    try {
      await navigator.clipboard.writeText(winCmd);
      setCopiedWin(true);
      setTimeout(() => setCopiedWin(false), 2000);
    } catch {
      setCopiedWin(false);
    }
  };

  const copyMac = async () => {
    try {
      await navigator.clipboard.writeText(macCmd);
      setCopiedMac(true);
      setTimeout(() => setCopiedMac(false), 2000);
    } catch {
      setCopiedMac(false);
    }
  };

  return (
    <section id="local-dev" className="py-16 sm:py-20 relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>Local Workstation Development</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            The modern XAMPP and WAMP alternative
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Avoid Apache rewrite quirks and heavy VM overhead. CloudDeck gives your workstation
            true Nginx production parity with automated Local Root CA padlocks on <code className="text-[#F4F8FA] font-mono">*.local</code>.
          </p>
        </div>

        {/* 2 Platform Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Windows WSL 2 Card */}
          <div className="deck-card p-5 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Laptop className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#F4F8FA]">Windows 10 &amp; 11</h3>
                    <p className="text-xs text-[#8FA6B5]">WSL 2 Native LEMP Workstation</p>
                  </div>
                </div>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-[#8FA6B5]">
                  PowerShell
                </span>
              </div>

              <ul className="mt-5 space-y-3 text-xs sm:text-sm text-[#8FA6B5]">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Native Windows CLI:</strong> Adds <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">clouddeck</code> directly to your Windows PATH for instant management.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Local CA Green Padlocks:</strong> Imports CloudDeck Root CA into the Windows Certificate Store for trusted <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">https://*.local</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FolderSync className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Host Drive Mapping:</strong> Edit directly from VS Code or Cursor in <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">C:\Projects</code> with zero permission conflicts.
                  </span>
                </li>
              </ul>
            </div>

            {/* PowerShell Command */}
            <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0E151E] p-3 text-[#F4F8FA]">
              <span className="truncate font-mono text-xs text-[#FAAA93]">{winCmd}</span>
              <button
                type="button"
                onClick={copyWin}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
                aria-label="Copy Windows installation command"
              >
                {copiedWin ? (
                  <>
                    <Check className="h-3 w-3 text-[#10B981]" />
                    <span className="text-[#10B981]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* macOS Card */}
          <div className="deck-card p-5 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Apple className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#F4F8FA]">macOS Workstation</h3>
                    <p className="text-xs text-[#8FA6B5]">Apple Silicon M1–M4 &amp; Intel</p>
                  </div>
                </div>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono text-[#8FA6B5]">
                  Zsh / Bash
                </span>
              </div>

              <ul className="mt-5 space-y-3 text-xs sm:text-sm text-[#8FA6B5]">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Native arm64 &amp; x86_64:</strong> Precompiled static Go binaries tailored for Apple Silicon (M1–M4) and Intel Macs.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">macOS Keychain Trust:</strong> Automatic Root CA registration ensures green padlocks in Safari and Chrome.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Homebrew Stack Supervision:</strong> Clean orchestration of Nginx, MariaDB, and PHP-FPM using native macOS <code className="rounded bg-white/5 border border-white/10 px-1 py-0.5 text-[11px] font-mono text-[#74B8CC]">launchctl</code>.
                  </span>
                </li>
              </ul>
            </div>

            {/* Terminal Command */}
            <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0E151E] p-3 text-[#F4F8FA]">
              <span className="truncate font-mono text-xs text-[#74B8CC]">{macCmd}</span>
              <button
                type="button"
                onClick={copyMac}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
                aria-label="Copy macOS installation command"
              >
                {copiedMac ? (
                  <>
                    <Check className="h-3 w-3 text-[#10B981]" />
                    <span className="text-[#10B981]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
