"use client";

import { useState } from "react";
import { Terminal, Copy, Check, ArrowRight, Github, BookOpen } from "lucide-react";

export function CtaSection() {
  const [copied, setCopied] = useState(false);
  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-[#D2ADAC]/60 bg-[#235361] p-8 text-center text-white shadow-2xl sm:p-14">
          {/* Ambient Glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#74B8CC]/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-[#FAAA93]/25 blur-3xl"
          />

          <div className="relative z-10">
            <span className="rounded-full bg-[#74B8CC]/20 px-3.5 py-1 text-xs font-bold text-[#74B8CC]">
              Zero License Fees • 100% Open Source
            </span>

            <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Ready to reclaim your servers?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#9BB2BA] sm:text-base leading-relaxed">
              Join developers, agencies, and sysadmins cutting monthly cPanel bills to $0 while running
              blazing-fast bare metal LEMP stacks on budget VPS hardware.
            </p>

            {/* Quick Copy Command */}
            <div className="mt-8 flex justify-center">
              <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#122228] px-4 py-3 text-xs sm:text-sm shadow-xl">
                <span className="truncate font-mono text-[#74B8CC]">{installCommand}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#182D35] px-3 py-1.5 text-xs font-semibold text-[#74B8CC] hover:bg-[#235361] hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#38BD87]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Links */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
              <a
                href="#install"
                className="flex items-center gap-2 rounded-full bg-[#FAAA93] px-6 py-3 text-xs font-bold text-[#14242B] shadow-md transition hover:bg-[#fa9e85]"
              >
                <span>Install on Linux VPS</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>

              <a
                href="https://github.com/dakshraman/clouddeck"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white transition hover:bg-white/20"
              >
                <Github className="h-4 w-4" />
                <span>GitHub Repository</span>
              </a>

              <a
                href="https://github.com/dakshraman/clouddeck/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white transition hover:bg-white/20"
              >
                <BookOpen className="h-4 w-4" />
                <span>Read the Docs</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

