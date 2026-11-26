"use client";

import { useState } from "react";
import { Menu, X, Github, ArrowRight } from "lucide-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-3 z-50 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav
        aria-label="Main Navigation"
        className="quiet-nav flex items-center justify-between rounded-xl px-4 py-2.5 sm:px-5 shadow-subtle"
      >
        {/* Brand Identity */}
        <a href="#top" className="flex items-center gap-2.5 group">
          <img
            src="/assets/favicon.svg"
            alt="CloudDeck"
            className="h-7 w-7 rounded-lg shadow-sm shrink-0"
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-[#F4F8FA]">
              CloudDeck
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-5 text-xs sm:text-sm font-medium text-[#8FA6B5]">
          <a href="#architecture" className="hover:text-[#F4F8FA] transition-colors">
            Architecture
          </a>
          <a href="#tour" className="hover:text-[#F4F8FA] transition-colors">
            Feature Tour
          </a>
          <a href="#comparison" className="hover:text-[#F4F8FA] transition-colors">
            Compare
          </a>
          <a href="#local-dev" className="hover:text-[#F4F8FA] transition-colors">
            Local Dev
          </a>
          <a href="#install" className="hover:text-[#F4F8FA] transition-colors">
            Install
          </a>
          <a href="#faq" className="hover:text-[#F4F8FA] transition-colors">
            FAQ
          </a>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex items-center gap-2.5">
          <a
            href="https://github.com/dakshraman/clouddeck"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#8FA6B5] hover:bg-white/10 hover:text-[#F4F8FA] hover:border-white/20 transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>

          <a
            href="#install"
            className="flex items-center gap-1.5 rounded-lg bg-[#74B8CC] px-3.5 py-1.5 text-xs font-semibold text-[#080C10] hover:bg-[#8fd2e5] transition-colors"
          >
            <span>Quickstart</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#8FA6B5] hover:text-[#F4F8FA] hover:bg-white/10 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4 text-[#8FA6B5]" />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mt-2 rounded-xl border border-white/10 bg-[#0D131A] p-4 shadow-raised md:hidden">
          <div className="flex flex-col gap-2.5 text-sm font-medium text-[#8FA6B5]">
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              Architecture
            </a>
            <a
              href="#tour"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              Feature Tour
            </a>
            <a
              href="#comparison"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              Compare
            </a>
            <a
              href="#local-dev"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              Local Dev
            </a>
            <a
              href="#install"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              Install
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-white"
            >
              FAQ
            </a>
            <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
              <a
                href="https://github.com/dakshraman/clouddeck"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#8FA6B5] hover:text-white"
              >
                <Github className="h-3.5 w-3.5" />
                <span>GitHub</span>
              </a>
              <a
                href="#install"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg bg-[#74B8CC] px-3 py-1 text-xs font-semibold text-[#080C10]"
              >
                Install
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
