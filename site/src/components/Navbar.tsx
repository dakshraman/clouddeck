"use client";

import { useState } from "react";
import { Terminal, Shield, Menu, X, Github, ExternalLink, ArrowRight } from "lucide-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav
        aria-label="Main Navigation"
        className="glass-nav flex items-center justify-between rounded-full px-4 py-2.5 shadow-sm transition-all sm:px-6"
      >
        {/* Brand Logo */}
        <a href="#top" className="flex items-center gap-2.5 transition hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#235361] text-[#74B8CC] shadow-inner">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-[#14242B]">
              CloudDeck
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <div className="hidden items-center gap-6 text-sm font-medium text-[#566E76] md:flex">
          <a href="#features" className="transition hover:text-[#235361]">
            Features
          </a>
          <a href="#under-the-hood" className="transition hover:text-[#235361]">
            Under the Hood
          </a>
          <a href="#comparison" className="transition hover:text-[#235361]">
            Compare
          </a>
          <a href="#local-dev" className="transition hover:text-[#235361]">
            Local Dev
          </a>
          <a href="#install" className="transition hover:text-[#235361]">
            Install
          </a>
          <a href="#faq" className="transition hover:text-[#235361]">
            FAQ
          </a>
        </div>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 sm:flex">
          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-[#235361] transition hover:border-[#6494AC] hover:bg-white"
          >
            <Github className="h-3.5 w-3.5" />
            <span>GitHub</span>
            <span className="rounded-full bg-[#74B8CC]/20 px-1.5 py-0.2 text-[10px] text-[#235361]">
              ★ Star
            </span>
          </a>

          <a
            href="#install"
            className="flex items-center gap-1.5 rounded-full bg-[#FAAA93] px-4 py-1.5 text-xs font-semibold text-[#14242B] shadow-sm transition hover:bg-[#fa9e85] hover:shadow-md"
          >
            <span>Quick Install</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#D2ADAC]/60 bg-white/70 text-[#235361] md:hidden"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-[#D2ADAC]/60 bg-[#FAF7F5]/95 p-4 shadow-xl backdrop-blur-lg md:hidden">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            Features
          </a>
          <a
            href="#under-the-hood"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            Under the Hood
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            Compare Matrix
          </a>
          <a
            href="#local-dev"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            Local Dev Suite
          </a>
          <a
            href="#install"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            Installation Guide
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#235361] hover:bg-[#74B8CC]/10"
          >
            FAQ
          </a>

          <div className="mt-2 flex flex-col gap-2 border-t border-[#D2ADAC]/40 pt-3">
            <a
              href="https://github.com/dakshraman/clouddeck"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-[#D2ADAC]/60 bg-white py-2 text-xs font-semibold text-[#235361]"
            >
              <Github className="h-4 w-4" />
              <span>Star on GitHub</span>
            </a>
            <a
              href="#install"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-full bg-[#FAAA93] py-2 text-xs font-semibold text-[#14242B]"
            >
              <span>Quick Install</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

