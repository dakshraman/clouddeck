"use client";

import { useState } from "react";
import { Menu, X, Github, ArrowRight, Bot, Terminal, Shield, Zap } from "lucide-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-3 sm:px-6">
      <nav
        aria-label="Main Navigation"
        className="glass-nav flex items-center justify-between rounded-full px-4 py-2.5 sm:px-6 shadow-2xl transition-all"
      >
        {/* Brand Logo */}
        <a href="#top" className="flex items-center gap-2.5 group transition">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#38BDF8] to-[#0284C7] text-[#080C10] shadow-md shadow-[#38BDF8]/20 group-hover:scale-105 transition-transform">
            <svg
              className="h-4 w-4 sm:h-5 sm:w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold tracking-tight text-white group-hover:text-[#38BDF8] transition-colors">
              CloudDeck
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-mono font-medium text-[#10B981]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              v0.6.54
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <div className="hidden lg:flex items-center gap-6 text-xs sm:text-sm font-medium text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#ai-agents" className="flex items-center gap-1 text-[#38BDF8] hover:text-[#7DD3FC] transition-colors">
            <Bot className="h-3.5 w-3.5 text-[#38BDF8]" />
            <span>AI Agents</span>
          </a>
          <a href="#under-the-hood" className="hover:text-white transition-colors">
            Architecture
          </a>
          <a href="#comparison" className="hover:text-white transition-colors">
            Compare
          </a>
          <a href="#local-dev" className="hover:text-white transition-colors">
            Local Dev
          </a>
          <a href="#install" className="hover:text-white transition-colors">
            Install
          </a>
          <a href="#faq" className="hover:text-white transition-colors">
            FAQ
          </a>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center gap-3">
          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20 transition"
          >
            <Github className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>

          <a
            href="#install"
            className="flex items-center gap-1.5 rounded-full bg-[#38BDF8] px-4 py-1.5 text-xs font-bold text-[#080C10] shadow-md shadow-[#38BDF8]/20 hover:bg-[#7DD3FC] transition"
          >
            <span>Quick Install</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#0C121A]/95 p-4 shadow-2xl backdrop-blur-xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>Features</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>
          <a
            href="#ai-agents"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/20 transition"
          >
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#38BDF8]" />
              <span>AI Coding Agents &amp; Doctor</span>
            </div>
            <span className="rounded-full bg-[#38BDF8]/20 px-2 py-0.5 text-[10px] font-mono text-[#38BDF8]">
              NEW
            </span>
          </a>
          <a
            href="#under-the-hood"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>Under the Hood</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>cPanel Comparison</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>
          <a
            href="#local-dev"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>Local Dev (WSL 2 &amp; Mac)</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>
          <a
            href="#install"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>Installation Guide</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition"
          >
            <span>FAQ</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
          </a>

          <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
            <a
              href="https://github.com/dakshraman/clouddeck"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
            >
              <Github className="h-4 w-4" />
              <span>GitHub Repository &bull; v0.6.54</span>
            </a>
            <a
              href="#install"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#38BDF8] py-2.5 text-xs font-bold text-[#080C10] shadow-md shadow-[#38BDF8]/20 transition"
            >
              <span>Quick Install (~4 mins)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
