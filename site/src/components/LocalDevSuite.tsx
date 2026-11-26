"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, Apple, Laptop, ShieldCheck, FolderSync, Zap, Sparkles } from "lucide-react";

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
    <section id="local-dev" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#74B8CC]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Local Workstation Development</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            The easiest way to develop on your computer
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Tired of broken XAMPP stacks and slow virtual machines? Run CloudDeck directly on your Mac or Windows laptop with real Nginx speed and green SSL padlocks on <code className="text-[#F4F8FA] font-mono">*.local</code>.
          </p>
        </div>

        {/* 2 Platform Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Windows WSL 2 Card */}
          <motion.div whileHover={{ y: -4 }} className="deck-card p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#74B8CC]">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-[#F4F8FA]">Windows 10 &amp; 11</h3>
                    <p className="text-xs text-[#8FA6B5]">Fast, native development via WSL 2</p>
                  </div>
                </div>
                <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono text-[#8FA6B5]">
                  PowerShell
                </span>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm text-[#8FA6B5]">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Native Windows Command:</strong> Run <code className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-xs font-mono text-[#74B8CC]">clouddeck</code> straight from Terminal or Command Prompt.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Automatic Green SSL Padlocks:</strong> Imports local certificates into your Windows Certificate Store so your browser never shows security warnings.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FolderSync className="h-4 w-4 shrink-0 text-[#74B8CC] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Use Your Favorite Code Editor:</strong> Edit files directly in VS Code, Cursor, or PHPStorm with live instant reloading.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-7 pt-5 border-t border-white/10">
              <span className="text-xs text-[#8FA6B5] block mb-2 font-medium">1-Line Windows PowerShell Install:</span>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#080C10] px-3.5 py-2.5">
                <span className="font-mono text-xs text-[#F4F8FA] truncate">{winCmd}</span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={copyWin}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:text-[#F4F8FA] hover:bg-white/10 transition-colors"
                >
                  {copiedWin ? (
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
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* macOS Card */}
          <motion.div whileHover={{ y: -4 }} className="deck-card p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#FAAA93]">
                    <Apple className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-[#F4F8FA]">macOS</h3>
                    <p className="text-xs text-[#8FA6B5]">Apple Silicon (M1/M2/M3/M4) &amp; Intel</p>
                  </div>
                </div>
                <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono text-[#8FA6B5]">
                  Zsh / Bash
                </span>
              </div>

              <ul className="mt-6 space-y-3.5 text-xs sm:text-sm text-[#8FA6B5]">
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Automatic Homebrew Setup:</strong> Intelligently installs Nginx, MariaDB, and PHP without interfering with existing Mac software.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#10B981] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Trusted Mac Keychain SSL:</strong> Adds certificates automatically to your macOS System Keychain for effortless HTTPS on Safari and Chrome.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap className="h-4 w-4 shrink-0 text-[#FAAA93] mt-0.5" />
                  <span>
                    <strong className="text-[#F4F8FA] font-medium">Sub-millisecond Local Speed:</strong> Native FastCGI sockets mean instant page loads with zero Docker battery drain.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-7 pt-5 border-t border-white/10">
              <span className="text-xs text-[#8FA6B5] block mb-2 font-medium">1-Line macOS Terminal Install:</span>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#080C10] px-3.5 py-2.5">
                <span className="font-mono text-xs text-[#F4F8FA] truncate">{macCmd}</span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={copyMac}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:text-[#F4F8FA] hover:bg-white/10 transition-colors"
                >
                  {copiedMac ? (
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
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
