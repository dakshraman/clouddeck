"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "How can CloudDeck consume under 50MB RAM when cPanel uses 1.5GB+?",
      a: "CloudDeck uses a compiled Go binary (stdlib only) for its system agent and a self-contained Next.js 15 server for the web panel. Unlike cPanel's 1990s legacy Perl/CGI monolith, CloudDeck does not run background interpreter daemons or duplicate services. It directly interfaces with native Linux binaries (Nginx, MariaDB, PowerDNS, Postfix) with zero virtualization overhead.",
    },
    {
      q: "How does the Zero-Root security model prevent RCE exploits?",
      a: "The web panel runs as an unprivileged system user (`clouddeck`). It never executes root commands directly. Instead, it sends token-authenticated typed requests over `127.0.0.1:9090` to the privileged Go daemon. The agent executes external commands using explicit, typed argument arrays (`exec.Command('nginx', '-t')`) with strictly validated regex patterns. Shell string interpolation (`sh -c`) is architecturally impossible.",
    },
    {
      q: "Can I replace XAMPP / WAMP / MAMP on my Windows or Mac workstation?",
      a: "Yes! CloudDeck's Local Development Suite installs cleanly on Windows 10/11 (via WSL 2) and macOS (via Homebrew + native arm64/x86 binaries). You get true Nginx production parity, multi-PHP (8.1–8.4) socket switching, deep-linked phpMyAdmin, and automated Local Root CA green padlocks on `https://*.local`.",
    },
    {
      q: "Is CloudDeck truly 100% free and open-source?",
      a: "Yes. CloudDeck is free and open-source software under an OSI-approved license. There are no monthly per-server fees ($30–$60+/month like cPanel), no per-domain caps, and no paywalled 'Pro' or 'Enterprise' feature restrictions.",
    },
    {
      q: "How do Dual-Mode .zip backups protect my data?",
      a: "CloudDeck creates standard, cross-platform `.zip` archives containing your site root and MariaDB database dump. You can download the archive to your personal computer for off-site cold storage or retain it on the server for 1-click in-place restoration, with optional automated sync to Telegram or Google Drive/Dropbox via rclone.",
    },
    {
      q: "What Linux distributions are supported?",
      a: "Ubuntu (20.04, 22.04, 24.04 LTS) and Debian (11, 12) on both x86_64 and arm64 architectures are fully automated by the installer. Any systemd-based Linux distribution can run CloudDeck using the static Go agent binary.",
    },
  ];

  return (
    <section id="faq" className="border-t border-[#D2ADAC]/40 bg-[#FAF7F5] py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#886351]">
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Got questions? <span className="text-[#235361]">We have answers.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            Everything you need to know about switching to CloudDeck.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="mt-12 space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.q}
                className="overflow-hidden rounded-2xl border border-[#D2ADAC]/60 bg-white shadow-xs transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6 transition hover:bg-[#FAF7F5]"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-bold text-[#14242B] sm:text-base">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#6494AC] transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-[#D2ADAC]/30 px-5 pt-3 pb-5 text-xs text-[#566E76] leading-relaxed sm:px-6 sm:text-sm">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

