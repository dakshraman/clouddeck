import { ChevronDown } from "lucide-react";

export function FaqSection() {
  const faqs = [
    {
      q: "How can CloudDeck consume under 50MB RAM when cPanel uses 1.5GB+?",
      a: "CloudDeck uses a compiled Go binary (stdlib only) for its system agent and an unprivileged Next.js server for the web panel. Unlike cPanel's legacy Perl/CGI monolith, CloudDeck does not run persistent interpreter daemons or duplicate services. It directly interfaces with native Linux binaries (Nginx, MariaDB, PowerDNS, Postfix) with zero virtualization overhead.",
    },
    {
      q: "How does the Zero-Root security model protect my server?",
      a: "The web panel runs as an unprivileged system user ('clouddeck'). It never executes root commands directly. Instead, it sends token-authenticated typed requests over 127.0.0.1:9090 to the privileged Go daemon. The agent executes external commands using explicit, typed argument arrays with strictly validated regex patterns. Shell string interpolation ('sh -c') is impossible.",
    },
    {
      q: "Can I replace XAMPP / WAMP / MAMP on my Windows or Mac workstation?",
      a: "Yes. CloudDeck's Local Development Suite installs cleanly on Windows 10/11 (via WSL 2) and macOS (via Homebrew). You get true Nginx production parity, multi-PHP (8.1–8.4) socket switching, deep-linked phpMyAdmin, and automated Local Root CA green padlocks on https://*.local without Apache rewrite quirks.",
    },
    {
      q: "How does multi-PHP coexistence work without Docker?",
      a: "CloudDeck provisions separate PHP-FPM pools for each supported PHP version (8.1, 8.2, 8.3, 8.4) listening on dedicated Unix domain sockets (/run/php/php8.x-fpm.sock). When you select a PHP version in a site's settings, CloudDeck renders the Nginx fastcgi_pass directive to point directly to that socket, achieving zero-overhead native execution.",
    },
    {
      q: "What developer AI tooling is integrated into CloudDeck?",
      a: "CloudDeck integrates orchestrators for Claude Code, OpenAI Codex, Antigravity, OpenCode, Aider, Ollama, Goose, and Hermes Agent. You can inspect installation states, launch them directly in the browser terminal, and store credentials safely in an encrypted mode-0600 key vault that automatically exports keys to shell sessions.",
    },
    {
      q: "How do Dual-Mode .zip backups protect my data?",
      a: "CloudDeck creates standard, cross-platform .zip archives containing your site document root and MariaDB database dump. You can download the archive to your personal computer for off-site cold storage or retain it on the server for 1-click in-place restoration, with optional automated sync to Telegram or cloud storage.",
    },
    {
      q: "How does CloudDeck manage cron jobs and scheduled tasks?",
      a: "CloudDeck includes a visual Cron Job Manager. You can schedule tasks using human-readable presets (Every Minute, Hourly, Daily, Weekly, Monthly) or standard 5-field crontab syntax. It features 1-click 'Run Now' testing to verify scripts before scheduling, real-time stdout/stderr log capture, and active/inactive toggles.",
    },
    {
      q: "Is CloudDeck truly 100% free and open-source?",
      a: "Yes. CloudDeck is free and open-source software under the MIT license. There are no monthly per-server fees ($30–$60+/month like cPanel), no per-domain caps, and no paywalled 'Pro' or 'Enterprise' feature restrictions.",
    },
    {
      q: "What Linux distributions are supported in production?",
      a: "Ubuntu (20.04, 22.04, 24.04 LTS) and Debian (11, 12) on both x86_64 and arm64 architectures are fully automated by the installer. Any systemd-based Linux distribution can run CloudDeck using the static Go agent binary.",
    },
  ];

  return (
    <section id="faq" className="border-t border-white/5 bg-[#0C121A] py-16 sm:py-20" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>Frequently Asked Questions</span>
          </div>
          <h2 id="faq-heading" className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Questions and technical details
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Everything you need to know about switching to CloudDeck and managing servers.
          </p>
        </div>

        {/* Native HTML Details Accordion per Modern Web Guidance */}
        <div className="mt-10 space-y-2.5">
          {faqs.map((faq, idx) => (
            <details
              key={faq.q}
              name="clouddeck-faq"
              className="faq-item group"
              open={idx === 0}
            >
              <summary className="text-sm font-medium text-[#F4F8FA] hover:text-[#74B8CC] transition-colors">
                <span>{faq.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#8FA6B5] transition-transform duration-200 group-open:rotate-180 group-open:text-[#74B8CC]" />
              </summary>
              <div className="faq-content">
                <p>{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
