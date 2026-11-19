"use client";

import { useState } from "react";
import { Terminal, Copy, Check, Apple, Laptop, ShieldCheck, FolderSync, Zap, Sparkles } from "lucide-react";

export function LocalDevSuite() {
  const [copiedWin, setCopiedWin] = useState(false);
  const [copiedMac, setCopiedMac] = useState(false);

  const winCmd = "irm https://clouddeck.dakshraman.in/install.ps1 | iex";
  const macCmd = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash";

  const copyWin = () => {
    navigator.clipboard.writeText(winCmd);
    setCopiedWin(true);
    setTimeout(() => setCopiedWin(false), 2000);
  };

  const copyMac = () => {
    navigator.clipboard.writeText(macCmd);
    setCopiedMac(true);
    setTimeout(() => setCopiedMac(false), 2000);
  };

  return (
    <section id="local-dev" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-semibold text-[#38BDF8]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>WORKSTATION DEV &bull; ZERO APACHE</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            The modern <span className="text-[#38BDF8]">XAMPP / WAMP</span> alternative.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            Say goodbye to Apache .htaccess rewrites, memory hogging VM bloat, and broken SSL certificates.
            CloudDeck gives your workstation true Nginx production parity with automatic Local CA green padlocks.
          </p>
        </div>

        {/* 2 Platform Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Windows WSL 2 Card */}
          <div className="deck-card p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-[#38BDF8]">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Windows 10 &amp; 11</h3>
                    <p className="text-xs text-slate-400">WSL 2 Native LEMP Workstation</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-[#38BDF8]">
                  PowerShell 1-Liner
                </span>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm text-slate-400">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Native Windows CLI:</strong> Adds <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">clouddeck</code> directly to your Windows PATH for instant start, stop, and status.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Local CA Green Padlocks:</strong> Automatically imports CloudDeck Root CA into Windows Certificate Store for trusted <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">https://*.local</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FolderSync className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Map Host Projects:</strong> Code in VS Code or Cursor directly inside <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">C:\Projects</code> with zero permission conflicts.
                  </span>
                </li>
              </ul>
            </div>

            {/* PowerShell Command */}
            <div className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080D13] p-3 text-white">
              <span className="truncate font-mono text-xs text-amber-400">{winCmd}</span>
              <button
                type="button"
                onClick={copyWin}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/10 hover:border-[#38BDF8]/30 transition"
                aria-label="Copy Windows installation command"
              >
                {copiedWin ? <Check className="h-3 w-3 text-[#10B981]" /> : <Copy className="h-3 w-3" />}
                <span>{copiedWin ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* macOS Card */}
          <div className="deck-card p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#818CF8]/10 border border-[#818CF8]/20 text-[#818CF8]">
                    <Apple className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">macOS Workstation</h3>
                    <p className="text-xs text-slate-400">Apple Silicon M1–M4 &amp; Intel</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#818CF8]/20 bg-[#6366F1]/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-[#818CF8]">
                  Terminal 1-Liner
                </span>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm text-slate-400">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Native arm64 &amp; x86_64:</strong> Precompiled static Go binaries tailored for Apple Silicon (M1/M2/M3/M4) and Intel Macs.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">macOS Keychain Trust:</strong> Automatic Root CA registration ensures green padlocks in Safari and Google Chrome.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-slate-200">Homebrew Stack Supervision:</strong> Clean orchestration of Nginx, MariaDB, and PHP-FPM using native macOS <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#38BDF8]">launchctl</code>.
                  </span>
                </li>
              </ul>
            </div>

            {/* Terminal Command */}
            <div className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080D13] p-3 text-white">
              <span className="truncate font-mono text-xs text-[#38BDF8]">{macCmd}</span>
              <button
                type="button"
                onClick={copyMac}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/10 hover:border-[#38BDF8]/30 transition"
                aria-label="Copy macOS installation command"
              >
                {copiedMac ? <Check className="h-3 w-3 text-[#10B981]" /> : <Copy className="h-3 w-3" />}
                <span>{copiedMac ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
