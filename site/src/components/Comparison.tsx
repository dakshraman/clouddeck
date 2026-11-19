import { Check, X, Shield, DollarSign, Cpu, Zap, Server, Globe, Bot, Stethoscope, Key, Clock, Sliders, ArrowRight } from "lucide-react";

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
      feature: "AI Coding Agents",
      clouddeck: "8 Native Agents (Claude, Codex, Ollama, Hermes)",
      cpanel: "None",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Autonomous Site Doctor",
      clouddeck: "0-100 Score + 1-Click Auto-Fix",
      cpanel: "None (manual log parsing)",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "AI Key Vault & Injection",
      clouddeck: "Encrypted 0600 Vault + Auto-Export",
      cpanel: "None",
      aapanel: "None",
      coolify: "Manual env vars",
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
      cpanel: "EasyApache (slow rebuild)",
      aapanel: "Extension list",
      coolify: "Dockerfile rebuild required",
    },
    {
      feature: "Websites & PHP Engine",
      clouddeck: "Nginx + Multi PHP-FPM (8.1–8.4) Sockets",
      cpanel: "Apache / LiteSpeed (heavy)",
      aapanel: "Nginx / Apache / OpenLiteSpeed",
      coolify: "Docker containerized PHP only",
    },
    {
      feature: "Polyglot App Supervision",
      clouddeck: "Node.js, Python, Go, Ruby (systemd)",
      cpanel: "Clunky Passenger / extra licensing",
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
    <section id="comparison" className="border-t border-white/5 bg-[#090D14] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-mono font-semibold text-[#38BDF8]">
            <span>TRANSPARENT COMPARISON &bull; v0.6.53</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Why switch to <span className="text-[#38BDF8]">CloudDeck</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
            See how CloudDeck compares against traditional legacy hosting panels and modern container PaaS platforms.
          </p>

          <div className="mt-3 inline-block sm:hidden text-[11px] font-mono text-slate-500">
            &larr; Swipe horizontally to compare platforms &rarr;
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="mt-10 overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0C121A] shadow-2xl">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#080D13]">
                  <th className="py-4 px-4 sm:px-6 font-bold text-slate-300">Feature</th>
                  <th className="py-4 px-4 sm:px-6 font-extrabold text-[#38BDF8] bg-[#38BDF8]/10 border-x border-[#38BDF8]/20">
                    CloudDeck (v0.6.53)
                  </th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-400">cPanel / WHM</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-400">aaPanel</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-400">Coolify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => (
                  <tr key={row.feature} className="transition hover:bg-white/[0.02]">
                    <td className="py-3.5 px-4 sm:px-6 font-semibold text-slate-200">
                      {row.feature}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-white bg-[#38BDF8]/[0.06] border-x border-[#38BDF8]/20">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-4 w-4 shrink-0 text-[#10B981]" />
                        <span>{row.clouddeck}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-400">{row.cpanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-400">{row.aapanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-400">{row.coolify}</td>
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
