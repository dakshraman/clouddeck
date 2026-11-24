import { Check } from "lucide-react";

export function Comparison() {
  const rows = [
    {
      feature: "Monthly License Cost",
      clouddeck: "$0 Free & Open Source",
      cpanel: "$30–$60+/mo ($360–$720/yr)",
      aapanel: "Freemium ($15–$25/mo Pro)",
      coolify: "$0 self-hosted ($5/mo cloud)",
    },
    {
      feature: "Memory Footprint (Idle)",
      clouddeck: "< 50 MB RAM (runs on 1GB VPS)",
      cpanel: "1.0 – 2.0+ GB RAM idle",
      aapanel: "400 MB – 800 MB RAM",
      coolify: "500 MB – 1.0 GB RAM",
    },
    {
      feature: "Security Architecture",
      clouddeck: "Unprivileged UI + Local Go Daemon (no sh -c)",
      cpanel: "Monolithic root Perl/CGI server",
      aapanel: "Web app runs as root (frequent CVEs)",
      coolify: "Container PaaS (root docker.sock)",
    },
    {
      feature: "Websites & PHP Engine",
      clouddeck: "Nginx + Multi PHP-FPM (8.1–8.4) Sockets",
      cpanel: "Apache / LiteSpeed (heavy)",
      aapanel: "Nginx / Apache / OpenLiteSpeed",
      coolify: "Docker containerized PHP only",
    },
    {
      feature: "Developer AI Agents",
      clouddeck: "Claude, Codex, Ollama, Hermes terminal orchestration",
      cpanel: "None",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Site Diagnostics & Repair",
      clouddeck: "Automated 0-100 Health Score & 1-Click Fix",
      cpanel: "None (manual log inspection)",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Credential Protection",
      clouddeck: "Encrypted 0600 Vault + Terminal Injection",
      cpanel: "None",
      aapanel: "None",
      coolify: "Manual environment variables",
    },
    {
      feature: "Scheduled Tasks / Cron",
      clouddeck: "Visual Crontab Manager + Run-Now Test",
      cpanel: "Basic Cron tab",
      aapanel: "Shell crontab",
      coolify: "Docker cron",
    },
    {
      feature: "PHP Extensions & Tuning",
      clouddeck: "1-Click Toggles + Visual php.ini Editor",
      cpanel: "EasyApache (rebuild required)",
      aapanel: "Extension list",
      coolify: "Dockerfile rebuild required",
    },
    {
      feature: "Polyglot App Supervision",
      clouddeck: "Node.js, Python, Go, Ruby (systemd)",
      cpanel: "Passenger / extra licensing",
      aapanel: "Limited Python/Node plugins",
      coolify: "First-class Docker PaaS",
    },
    {
      feature: "1-Click Panel SSL",
      clouddeck: "Self-Signed (IP SANs) or Let's Encrypt",
      cpanel: "AutoSSL (domain only, no IP SANs)",
      aapanel: "Self-signed or Let's Encrypt",
      coolify: "Traefik / Let's Encrypt (domains only)",
    },
    {
      feature: "Built-in Production Mail",
      clouddeck: "Postfix + Dovecot + RSA DKIM + SPF",
      cpanel: "Exim + Dovecot + cPanel Mail",
      aapanel: "Paid mail plugin or CyberPanel mail",
      coolify: "None (requires 3rd-party SMTP)",
    },
    {
      feature: "Authoritative DNS Server",
      clouddeck: "PowerDNS (SQLite backend)",
      cpanel: "BIND (named) complex zones",
      aapanel: "PowerDNS / BIND plugins",
      coolify: "None (requires external DNS)",
    },
    {
      feature: "Dual-Mode .zip Backups",
      clouddeck: "PC download & in-place restore",
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
            How CloudDeck compares to traditional panels
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Comparison across resource consumption, security models, and developer tooling.
          </p>

          <div className="mt-3 inline-block sm:hidden text-[11px] font-mono text-[#546C7B]">
            &larr; Scroll horizontally to compare platforms &rarr;
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="mt-10 overflow-hidden rounded-xl border border-white/10 bg-[#101720] shadow-subtle">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
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
