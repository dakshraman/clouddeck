import { Check, X, Shield, DollarSign, Cpu, Zap, Server, Globe } from "lucide-react";

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
      feature: "Security Architecture",
      clouddeck: "Unprivileged UI + Local Go Daemon (no sh -c)",
      clouddeckHighlight: true,
      cpanel: "Monolithic root Perl/CGI server",
      aapanel: "Web app runs as root (frequent CVEs)",
      coolify: "Container PaaS (root docker.sock)",
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
            <span>Transparent Comparison</span>
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
                  <th className="p-4 sm:p-5 font-bold text-[#14242B]">Metric / Feature</th>
                  <th className="p-4 sm:p-5 font-bold bg-[#74B8CC]/15 text-[#235361]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#38BD87]" />
                      <span>CloudDeck</span>
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 font-semibold text-[#566E76]">cPanel / WHM</th>
                  <th className="p-4 sm:p-5 font-semibold text-[#566E76]">aaPanel / CyberPanel</th>
                  <th className="p-4 sm:p-5 font-semibold text-[#566E76]">Coolify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D2ADAC]/30">
                {rows.map((row) => (
                  <tr key={row.feature} className="transition hover:bg-[#FAF7F5]/50">
                    <td className="p-4 sm:p-5 font-semibold text-[#14242B]">{row.feature}</td>
                    <td className="p-4 sm:p-5 bg-[#74B8CC]/5 font-bold text-[#235361]">
                      {row.clouddeck}
                    </td>
                    <td className="p-4 sm:p-5 text-[#566E76]">{row.cpanel}</td>
                    <td className="p-4 sm:p-5 text-[#566E76]">{row.aapanel}</td>
                    <td className="p-4 sm:p-5 text-[#566E76]">{row.coolify}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Comparison Callout */}
        <div className="mt-8 rounded-2xl border border-[#D2ADAC]/60 bg-[#235361] p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div>
              <h4 className="text-lg font-bold text-white">
                Zero Monthly Fees. Zero Root Web Exploits.
              </h4>
              <p className="mt-1 text-xs text-[#9BB2BA] sm:text-sm">
                Save $360 to $720 every single year per server while enjoying modern Next.js 15
                and Go reliability.
              </p>
            </div>
            <a
              href="#install"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#FAAA93] px-5 py-2.5 text-xs font-bold text-[#14242B] shadow-md transition hover:bg-[#fa9e85]"
            >
              <span>Install CloudDeck Free</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

