"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "How can CloudDeck consume under 50MB RAM when cPanel uses 1.5GB+?",
      a: "CloudDeck uses a compiled Go binary (stdlib only) for its system agent and a self-contained Next.js 16 server for the web panel. Unlike cPanel's legacy Perl/CGI monolith, CloudDeck does not run persistent interpreter daemons or duplicate services. It directly interfaces with native Linux binaries (Nginx, MariaDB, PowerDNS, Postfix) with zero virtualization overhead.",
    },
    {
      q: "What AI coding agents are integrated into CloudDeck?",
      a: "CloudDeck natively supports and manages 8 top AI coding agents: Claude Code, OpenAI Codex, Google Antigravity, OpenCode, Aider, Ollama (for offline local models such as Llama 3, DeepSeek-Coder, and Qwen), Goose, and Hermes Agent. You can inspect installation status, install or update agents with one click, and launch them immediately in the built-in browser web terminal.",
    },
    {
      q: "How does the autonomous Site Doctor & 1-Click Auto-Fix work?",
      a: "Site Doctor analyzes any hosted domain across 6 critical pillars: Nginx virtual host configuration syntax, SSL certificate validity and expiration, DNS record propagation, MariaDB database connectivity, webroot directory ownership/permissions, and PHP error logs. It generates a 0–100 health score with detailed findings and offers a 1-click Auto-Fix button that automatically repairs broken configurations, restores file permissions, and re-requests missing certificates.",
    },
    {
      q: "How does the AI Key Vault protect API credentials?",
      a: "API credentials for Anthropic, OpenAI, DeepSeek, Google Gemini, and Ollama are stored in an encrypted local vault (/etc/clouddeck/vault.json) with strict 0600 Linux permissions owned by root. The web panel masks keys on retrieval so secrets are never displayed raw in the browser. When you launch the web terminal, stored keys are automatically injected into the shell session so agents run seamlessly without manual credential exports.",
    },
    {
      q: "How does the Zero-Root security model prevent RCE exploits?",
      a: "The web panel runs as an unprivileged system user ('clouddeck'). It never executes root commands directly. Instead, it sends token-authenticated typed requests over 127.0.0.1:9090 to the privileged Go daemon. The agent executes external commands using explicit, typed argument arrays (exec.Command('nginx', '-t')) with strictly validated regex patterns. Shell string interpolation ('sh -c') is architecturally impossible.",
    },
    {
      q: "Can I replace XAMPP / WAMP / MAMP on my Windows or Mac workstation?",
      a: "Yes! CloudDeck's Local Development Suite installs cleanly on Windows 10/11 (via WSL 2) and macOS (via Homebrew + native arm64/x86 binaries). You get true Nginx production parity, multi-PHP (8.1–8.4) socket switching, deep-linked phpMyAdmin, and automated Local Root CA green padlocks on https://*.local.",
    },
    {
      q: "How does CloudDeck manage cron jobs and scheduled tasks?",
      a: "CloudDeck includes a visual cPanel-style Cron Job Manager. You can schedule tasks using human-readable presets (Every Minute, Hourly, Daily, Weekly, Monthly) or standard 5-field crontab syntax. It features 1-click 'Run Now' testing to verify scripts before scheduling, real-time stdout/stderr log capture, and active/inactive toggles.",
    },
    {
      q: "Is CloudDeck truly 100% free and open-source?",
      a: "Yes. CloudDeck is free and open-source software under the MIT license. There are no monthly per-server fees ($30–$60+/month like cPanel), no per-domain caps, and no paywalled 'Pro' or 'Enterprise' feature restrictions.",
    },
    {
      q: "How do Dual-Mode .zip backups protect my data?",
      a: "CloudDeck creates standard, cross-platform .zip archives containing your site root and MariaDB database dump. You can download the archive to your personal computer for off-site cold storage or retain it on the server for 1-click in-place restoration, with optional automated sync to Telegram or Google Drive/Dropbox via rclone.",
    },
    {
      q: "What Linux distributions are supported?",
      a: "Ubuntu (20.04, 22.04, 24.04 LTS) and Debian (11, 12) on both x86_64 and arm64 architectures are fully automated by the installer. Any systemd-based Linux distribution can run CloudDeck using the static Go agent binary.",
    },
  ];

  return (
    <section id="faq" className="border-t border-white/5 bg-[#090D14] py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-semibold text-[#38BDF8]">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>FREQUENTLY ASKED QUESTIONS</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Got questions? <span className="text-[#38BDF8]">We have answers.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            Everything you need to know about switching to CloudDeck and utilizing AI agents.
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="mt-12 space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.q}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#0C121A] shadow-md transition hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6 transition hover:bg-white/[0.02]"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-bold text-white sm:text-base">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#38BDF8] transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-white/5 px-5 pt-3 pb-5 text-xs text-slate-400 leading-relaxed sm:px-6 sm:text-sm">
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
