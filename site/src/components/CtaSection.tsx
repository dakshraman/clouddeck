"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, ArrowRight, Github, Sparkles, Heart } from "lucide-react";

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
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-white/10 bg-[#0D131A] p-6 text-center text-[#F4F8FA] shadow-2xl sm:p-12 relative overflow-hidden"
        >
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-96 rounded-full bg-[#74B8CC]/15 blur-3xl" />

          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#74B8CC]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>100% Free &amp; Open Source</span>
            </span>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-4xl text-[#F4F8FA]">
              Ready to take control of your websites?
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-[#8FA6B5] leading-relaxed">
              Install CloudDeck in under two minutes on any clean Ubuntu or Debian server, or try it on your Mac or Windows laptop.
            </p>

            {/* Quick Copy Command */}
            <div className="mt-8 flex justify-center">
              <motion.div
                whileHover={{ borderColor: "rgba(116, 184, 204, 0.4)" }}
                className="flex w-full max-w-lg items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080C10] px-4 py-2.5 text-xs sm:text-sm shadow-inner transition-colors"
              >
                <div className="flex items-center gap-2 overflow-hidden font-mono">
                  <span className="text-[#74B8CC] select-none font-bold">$</span>
                  <span className="truncate text-[#F4F8FA]">{installCommand}</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={handleCopy}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-all ${
                    copied
                      ? "border-[#10B981]/50 bg-[#10B981]/15 text-[#10B981]"
                      : "border-white/10 bg-white/5 text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA]"
                  }`}
                  aria-label="Copy installation command"
                >
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.div
                        key="copied"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5 text-[#10B981]" />
                        <span>Copied!</span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            </div>

            {/* Action Buttons */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href="#install"
                className="flex items-center gap-2 rounded-xl bg-[#74B8CC] px-6 py-2.5 text-xs sm:text-sm font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-all shadow-md"
              >
                <span>Read Full Install Guide</span>
                <ArrowRight className="h-4 w-4" />
              </motion.a>

              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                href="https://github.com/dakshraman/clouddeck"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs sm:text-sm font-medium text-[#F4F8FA] hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <Github className="h-4 w-4 text-[#8FA6B5]" />
                <span>Star on GitHub</span>
              </motion.a>
            </div>

            <p className="mt-6 text-xs text-[#546C7B] flex items-center justify-center gap-1">
              <span>Made with</span>
              <Heart className="h-3 w-3 text-[#FAAA93] fill-[#FAAA93]" />
              <span>for website owners, developers &amp; creators</span>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
