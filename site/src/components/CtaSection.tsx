"use client";

import { useState } from "react";
import { Terminal, Copy, Check, ArrowRight, Github, BookOpen, Sparkles } from "lucide-react";

export function CtaSection() {
  const [copied, setCopied] = useState(false);
  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0C121A] p-8 text-center text-white shadow-2xl sm:p-14">
          {/* Ambient Glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#38BDF8]/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#6366F1]/15 blur-3xl"
          />

          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-3.5 py-1 text-xs font-mono font-bold text-[#10B981]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              Zero License Fees &bull; 100% Free &amp; Open Source MIT
            </span>

            <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl text-white">
              Ready to reclaim your servers?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-slate-400 leading-relaxed">
              Join developers, agencies, and sysadmins cutting monthly cPanel bills to $0 while running
              blazing-fast bare metal LEMP stacks on budget VPS hardware.
            </p>

            {/* Quick Copy Command */}
            <div className="mt-8 flex justify-center">
              <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#080D13] px-4 py-3 text-xs sm:text-sm shadow-2xl">
                <div className="flex items-center gap-2 overflow-hidden font-mono">
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

            {/* Links */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
              <a
                href="#install"
                className="flex items-center gap-2 rounded-full bg-[#38BDF8] px-6 py-2.5 text-xs font-bold text-[#080C10] shadow-md shadow-[#38BDF8]/20 hover:bg-[#7DD3FC] transition"
              >
                <span>Read Install Guide</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>

              <a
                href="https://github.com/dakshraman/clouddeck"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
              >
                <Github className="h-3.5 w-3.5" />
                <span>View on GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
