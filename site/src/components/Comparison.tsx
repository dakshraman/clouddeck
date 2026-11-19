import { Check, X, Shield, DollarSign, Cpu, Zap, Server, Globe, Bot, Stethoscope, Key, Clock, Sliders } from "lucide-react";

export function Comparison() {
  const rows = [
    {
      feature: "Monthly License Cost",
      clouddeck: "$0 Free & Open Source",
      clouddeckHighlight: true,
      cpanel: "$30–$60+/mo ($360–$720/yr)",
      aapanel: "Freemium ($15–$25/mo Pro)",
      coolify: "$0 self-hosted ($5/mo cloud)",
    },
    {
      feature: "Memory Footprint (Idle)",
      clouddeck: "< 50 MB RAM (runs on 1GB VPS)",
      clouddeckHighlight: true,
      cpanel: "1.0 – 2.0+ GB RAM idle",
      aapanel: "400 MB – 800 MB RAM",
      coolify: "500 MB – 1.0 GB RAM",
    },
    {
      feature: "Security Architecture",
      clouddeck: "Unprivileged UI + Local Go Daemon (no sh -c)",
      clouddeckHighlight: true,
      cpanel: "Monolithic root Perl/CGI server",
      aapanel: "Web app runs as root (frequent CVEs)",
      coolify: "Container PaaS (root docker.sock)",
    },
    {
      feature: "AI Coding Agents",
      clouddeck: "8 Native Agents (Claude, Codex, Ollama, Hermes)",
      clouddeckHighlight: true,
      cpanel: "None",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Autonomous Site Doctor",
      clouddeck: "0-100 Score + 1-Click Auto-Fix",
      clouddeckHighlight: true,
      cpanel: "None (manual log parsing)",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "AI Key Vault & Injection",
      clouddeck: "Encrypted 0600 Vault + Auto-Export",
      clouddeckHighlight: true,
      cpanel: "None",
      aapanel: "None",
      coolify: "Manual env vars",
    },
    {
      feature: "Scheduled Tasks / Cron",
      clouddeck: "Visual Crontab Manager + Run-Now Test",
      clouddeckHighlight: true,
      cpanel: "Basic Cron tab",
      aapanel: "Shell crontab",
      coolify: "Docker cron",
    },
    {
      feature: "PHP Extensions & Tuning",
      clouddeck: "1-Click Toggles + Visual php.ini Editor",
      clouddeckHighlight: true,
      cpanel: "EasyApache (slow rebuild)",
      aapanel: "Extension list",
      coolify: "Dockerfile rebuild required",
    },
    {
      feature: "Websites & PHP Engine",
      clouddeck: "Nginx + Multi PHP-FPM (8.1–8.4) Sockets",
      clouddeckHighlight: true,
      cpanel: "Apache / LiteSpeed (heavy)",
      aapanel: "Nginx / Apache / OpenLiteSpeed",
      coolify: "Docker containerized PHP only",
    },
    {
      feature: "Polyglot App Supervision",
      clouddeck: "Node.js, Python, Go, Ruby (systemd)",
      clouddeckHighlight: true,
      cpanel: "Clunky Passenger / extra licensing",
      aapanel: "Limited Python/Node plugins",
      coolify: "First-class Docker PaaS",
    },
    {
      feature: "1-Click Panel SSL",
      clouddeck: "Self-Signed (IP SANs) or Let's Encrypt",
      clouddeckHighlight: true,
      cpanel: "AutoSSL (domain only, no IP SANs)",
      aapanel: "Self-signed or Let's Encrypt",
      coolify: "Traefik / Let's Encrypt (domains only)",
    },
    {
      feature: "Built-in Production Mail",
      clouddeck: "Postfix + Dovecot + RSA DKIM + SPF",
      clouddeckHighlight: true,
      cpanel: "Exim + Dovecot + cPanel Mail",
      aapanel: "Paid mail plugin or CyberPanel mail",
      coolify: "None (requires 3rd-party SMTP)",
    },
    {
      feature: "Authoritative DNS Server",
      clouddeck: "PowerDNS (SQLite backend)",
      clouddeckHighlight: true,
      cpanel: "BIND (named) complex zones",
      aapanel: "PowerDNS / BIND plugins",
      coolify: "None (requires external DNS)",
    },
    {
      feature: "Dual-Mode .zip Backups",
      clouddeck: "PC download & in-place restore",
      clouddeckHighlight: true,
      cpanel: "cPanel tar backup wizard",
      aapanel: "Manual backup script",
      coolify: "Volume snapshot & S3 export",
    },
  ];

  return (
    <section id="comparison" className="border-t border-[#D2ADAC]/40 bg-[#FAF7F5] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#D2ADAC]/60 bg-white/70 px-3 py-1 text-xs font-semibold text-[#235361]">
            <span>Transparent Comparison &bull; v0.6.53</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[#14242B] sm:text-5xl">
            Why switch to <span className="text-[#235361]">CloudDeck</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#566E76] sm:text-lg">
            See how CloudDeck compares against traditional legacy panels and modern container tools.
          </p>
        </div>

        {/* Responsive Table Container */}
        <div className="mt-12 overflow-hidden rounded-2xl border border-[#D2ADAC]/60 bg-white shadow-xl sm:rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#D2ADAC]/40 bg-[#F4EFEB]">
                  <th className="py-4 px-4 sm:px-6 font-bold text-[#14242B]">Feature</th>
                  <th className="py-4 px-4 sm:px-6 font-extrabold text-[#235361] bg-[#74B8CC]/15">
                    CloudDeck (v0.6.53)
                  </th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-[#566E76]">cPanel / WHM</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-[#566E76]">aaPanel</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-[#566E76]">Coolify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D2ADAC]/30">
                {rows.map((row) => (
                  <tr key={row.feature} className="transition hover:bg-[#FAF7F5]/60">
                    <td className="py-3.5 px-4 sm:px-6 font-semibold text-[#14242B]">
                      {row.feature}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-[#235361] bg-[#74B8CC]/10">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-[#38BD87]" />
                        <span>{row.clouddeck}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#566E76]">{row.cpanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#566E76]">{row.aapanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#566E76]">{row.coolify}</td>
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
