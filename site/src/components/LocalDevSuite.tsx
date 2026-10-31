"use client";

import { useState } from "react";
import { Terminal, Copy, Check, Apple, Laptop, ShieldCheck, FolderSync, Zap } from "lucide-react";

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
    <section id="local-dev" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#886351]">
            <span>Workstation Development</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            The modern <span className="text-[#235361]">XAMPP / WAMP</span> alternative.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            Say goodbye to Apache .htaccess rewrites, memory hogging VM bloat, and broken SSL certificates.
            CloudDeck gives your workstation true Nginx production parity with automatic Local CA green padlocks.
          </p>
        </div>

        {/* 2 Platform Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Windows WSL 2 Card */}
          <div className="uni-card p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#235361] text-[#74B8CC]">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#14242B]">Windows 10 &amp; 11</h3>
                  <p className="text-xs text-[#566E76]">WSL 2 Native LEMP Suite</p>
                </div>
              </div>
              <span className="rounded-full bg-[#74B8CC]/15 px-2.5 py-0.5 text-xs font-semibold text-[#235361]">
                PowerShell 1-Liner
              </span>
            </div>

            <ul className="mt-6 space-y-3 text-xs sm:text-sm text-[#566E76]">
              <li className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">Native Windows CLI:</strong> Adds <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">clouddeck</code> directly to your Windows PATH for instant start/stop/status.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">Local CA Green Padlocks:</strong> Automatically imports CloudDeck Root CA into Windows Certificate Store for trusted <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">https://*.local</code>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FolderSync className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">Map Host Projects:</strong> Code in VS Code or Cursor directly inside <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">C:\Projects</code> with zero permission issues.
                </span>
              </li>
            </ul>

            {/* PowerShell Command */}
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-[#122228] p-3 text-white">
              <span className="truncate font-mono text-xs text-[#FAAA93]">{winCmd}</span>
              <button
                type="button"
                onClick={copyWin}
                className="flex shrink-0 items-center gap-1 rounded bg-[#182D35] px-2.5 py-1 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
              >
                {copiedWin ? <Check className="h-3 w-3 text-[#38BD87]" /> : <Copy className="h-3 w-3" />}
                <span>{copiedWin ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* macOS Card */}
          <div className="uni-card p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FAAA93] text-[#14242B]">
                  <Apple className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#14242B]">macOS Workstation</h3>
                  <p className="text-xs text-[#566E76]">Apple Silicon M1–M4 &amp; Intel</p>
                </div>
              </div>
              <span className="rounded-full bg-[#FAAA93]/20 px-2.5 py-0.5 text-xs font-bold text-[#14242B]">
                Terminal 1-Liner
              </span>
            </div>

            <ul className="mt-6 space-y-3 text-xs sm:text-sm text-[#566E76]">
              <li className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">Native arm64 &amp; x86_64:</strong> Precompiled static Go binaries tailored for Apple Silicon (M1/M2/M3/M4) and Intel Macs.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">macOS Keychain Trust:</strong> Automatic Root CA registration ensures green padlocks in Safari and Google Chrome.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Zap className="h-4 w-4 shrink-0 text-[#38BD87] mt-0.5" />
                <span>
                  <strong className="text-[#14242B]">Homebrew Stack Supervision:</strong> Clean orchestration of Nginx, MariaDB, and PHP-FPM using native macOS <code className="rounded bg-[#FAF7F5] px-1 py-0.5 text-xs text-[#235361]">launchctl</code>.
                </span>
              </li>
            </ul>

            {/* Terminal Command */}
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-[#122228] p-3 text-white">
              <span className="truncate font-mono text-xs text-[#74B8CC]">{macCmd}</span>
              <button
                type="button"
                onClick={copyMac}
                className="flex shrink-0 items-center gap-1 rounded bg-[#182D35] px-2.5 py-1 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361]"
              >
                {copiedMac ? <Check className="h-3 w-3 text-[#38BD87]" /> : <Copy className="h-3 w-3" />}
                <span>{copiedMac ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

