"use client";

import { useState } from "react";
import { Copy, Check, ArrowRight, Github } from "lucide-react";

export function CtaSection() {
  const [copied, setCopied] = useState(false);
  const installCommand = "curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="py-16 sm:py-20 relative">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-xl border border-white/10 bg-[#101720] p-6 text-center text-[#F4F8FA] shadow-subtle sm:p-12">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
              <span>Free &amp; Open Source • MIT License</span>
            </span>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-4xl text-[#F4F8FA]">
              Ready to run your servers on bare metal?
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-[#8FA6B5] leading-relaxed">
              Eliminate expensive recurring software licenses while running high-performance Nginx and multi-PHP stacks with under 50MB of idle memory.
            </p>

            {/* Quick Copy Command */}
            <div className="mt-7 flex justify-center">
              <div className="flex w-full max-w-lg items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0A0E13] px-3.5 py-2.5 text-xs sm:text-sm shadow-sm">
                <div className="flex items-center gap-2 overflow-hidden font-mono">
                  <span className="text-[#74B8CC] select-none font-bold">$</span>
                  <span className="truncate text-[#F4F8FA]">{installCommand}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] transition"
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

            {/* Action Links */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold">
              <a
                href="#install"
                className="flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-4 py-2 text-xs font-semibold text-[#0A0E13] hover:bg-[#85c6d8] transition"
              >
                <span>Installation Guide</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>

              <a
                href="https://github.com/dakshraman/clouddeck"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#8FA6B5] hover:text-[#F4F8FA] hover:bg-white/10 hover:border-white/20 transition"
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
