import { Check } from "lucide-react";

export function Comparison() {
  const rows = [
    {
      feature: "Monthly License Cost",
      clouddeck: "$0 Free & Open Source (MIT)",
      cpanel: "$30–$60+/mo per server ($360–$720/yr)",
      aapanel: "Freemium ($15–$25/mo Pro)",
      coolify: "$0 self-hosted ($5/mo cloud)",
    },
    {
      feature: "Idle Memory Footprint",
      clouddeck: "< 50 MB RAM (runs on 1GB VPS)",
      cpanel: "1.0 – 2.0+ GB RAM idle",
      aapanel: "400 MB – 800 MB RAM",
      coolify: "500 MB – 1.0 GB+ RAM",
    },
    {
      feature: "Security Architecture",
      clouddeck: "Unprivileged UI + Local Go Daemon (no sh -c)",
      cpanel: "Monolithic root Perl/CGI server",
      aapanel: "Web app runs as root (frequent CVEs)",
      coolify: "Container PaaS (root docker.sock)",
    },
    {
      feature: "Multi-Server Fleet Management",
      clouddeck: "Native Fleet Clusters & Node Health Checks",
      cpanel: "WHM multi-server (requires paid licenses)",
      aapanel: "None (single server only)",
      coolify: "Remote servers via SSH",
    },
    {
      feature: "1-Click App Store & Stacks",
      clouddeck: "Docker Compose (Ghost, Plausible, n8n, MinIO)",
      cpanel: "Softaculous / cPAddons (PHP scripts only)",
      aapanel: "Limited app store plugins",
      coolify: "300+ 1-click community templates",
    },
    {
      feature: "Git CI/CD & Atomic Rollbacks",
      clouddeck: "Native Git Releases & 1-Click Rollback",
      cpanel: "Basic Git Version Control (no rollback)",
      aapanel: "Manual git clone webhook",
      coolify: "Automated git push deployments",
    },
    {
      feature: "Websites & Bare-Metal LEMP",
      clouddeck: "Native Nginx + Coexisting PHP-FPM (8.1–8.4)",
      cpanel: "Apache / LiteSpeed (heavy overhead)",
      aapanel: "Nginx / Apache / OpenLiteSpeed",
      coolify: "Docker containerized PHP only",
    },
    {
      feature: "Built-in Production Email",
      clouddeck: "Postfix + Dovecot + RSA-2048 DKIM + SPF",
      cpanel: "Exim + Dovecot + cPanel Mail",
      aapanel: "Paid mail plugin or CyberPanel mail",
      coolify: "None (requires 3rd-party SMTP)",
    },
    {
      feature: "Authoritative DNS Server",
      clouddeck: "PowerDNS (SQLite / MySQL backend)",
      cpanel: "BIND (named) complex zones",
      aapanel: "PowerDNS / BIND plugins",
      coolify: "None (requires external DNS)",
    },
    {
      feature: "Wildcard SSL & Panel SSL",
      clouddeck: "IP SANs + Let's Encrypt + Wildcard DNS-01",
      cpanel: "AutoSSL (domain only, no IP SANs)",
      aapanel: "Self-signed or Let's Encrypt",
      coolify: "Traefik Let's Encrypt (domains only)",
    },
    {
      feature: "Developer AI Agent Launcher",
      clouddeck: "Claude, Codex, Antigravity, Ollama, Hermes",
      cpanel: "None",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Site Diagnostics & Auto-Fix",
      clouddeck: "0-100 Site Doctor Score + 1-Click Repair",
      cpanel: "None (manual log inspection)",
      aapanel: "None",
      coolify: "Basic container healthchecks",
    },
    {
      feature: "WordPress Staging & Production Sync",
      clouddeck: "1-Click Push/Pull Staging with DB Rewrite",
      cpanel: "cPanel WP Toolkit Staging (clunky)",
      aapanel: "Manual export and import",
      coolify: "Manual Docker container duplication",
    },
    {
      feature: "Scheduled Tasks / Cron",
      clouddeck: "Visual Crontab Manager + 1-Click Run-Now",
      cpanel: "Basic Cron tab",
      aapanel: "Shell crontab",
      coolify: "Docker container cron",
    },
    {
      feature: "Dual-Mode .zip Backups",
      clouddeck: "PC download & in-place restore + Telegram sync",
      cpanel: "cPanel tar backup wizard",
      aapanel: "Manual backup script",
      coolify: "Volume snapshot & S3 export",
    },
  ];

  return (
    <section id="comparison" className="border-t border-white/5 bg-[#0C121A] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-mono font-medium text-[#74B8CC]">
            <span>Platform Comparison</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            CloudDeck vs. cPanel, aaPanel &amp; Coolify
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            See how CloudDeck combines traditional hosting power (bare-metal LEMP, multi-PHP, mail, DNS) with modern PaaS workflows (App Store, Git rollbacks, fleet management) in under 50MB of RAM.
          </p>

          <div className="mt-3 inline-block sm:hidden text-[11px] font-mono text-[#546C7B]">
            &larr; Scroll horizontally to compare platforms &rarr;
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#101720] shadow-subtle">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#0E151E] text-xs font-mono">
                  <th className="py-3.5 px-4 sm:px-5 font-medium text-[#8FA6B5]">Feature</th>
                  <th className="py-3.5 px-4 sm:px-5 font-semibold text-[#74B8CC] bg-white/[0.03]">
                    CloudDeck (v0.6.55)
                  </th>
                  <th className="py-3.5 px-4 sm:px-5 font-normal text-[#8FA6B5]">cPanel / WHM</th>
                  <th className="py-3.5 px-4 sm:px-5 font-normal text-[#8FA6B5]">aaPanel</th>
                  <th className="py-3.5 px-4 sm:px-5 font-normal text-[#8FA6B5]">Coolify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => (
                  <tr key={row.feature} className="transition hover:bg-white/[0.02]">
                    <td className="py-3 px-4 sm:px-5 font-medium text-[#F4F8FA]">
                      {row.feature}
                    </td>
                    <td className="py-3 px-4 sm:px-5 font-medium text-[#F4F8FA] bg-white/[0.02]">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                        <span>{row.clouddeck}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-[#8FA6B5]">{row.cpanel}</td>
                    <td className="py-3 px-4 sm:px-5 text-[#8FA6B5]">{row.aapanel}</td>
                    <td className="py-3 px-4 sm:px-5 text-[#8FA6B5]">{row.coolify}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
