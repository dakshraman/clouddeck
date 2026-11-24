export function StackStrip() {
  const stack = [
    { name: "Under 50MB RAM", role: "Lightweight Go stdlib daemon" },
    { name: "Zero-Root Web Panel", role: "Next.js unprivileged on port 2083" },
    { name: "Multi-PHP Coexistence", role: "PHP 8.1, 8.2, 8.3, 8.4 FPM sockets" },
    { name: "MariaDB & PostgreSQL", role: "Native SQL with 1-click dumps" },
    { name: "Production Email", role: "Postfix + Dovecot + RSA DKIM" },
    { name: "Authoritative DNS", role: "PowerDNS SQLite zones" },
    { name: "ModSecurity & Fail2ban", role: "OWASP CRS & UFW firewall" },
    { name: "Developer AI Agents", role: "Local terminal orchestration" },
  ];

  return (
    <div className="border-y border-white/5 bg-[#0C121A] py-6 sm:py-7">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-mono text-[#8FA6B5]">
          Bare-metal Linux architecture • Zero Docker virtualization overhead • Low memory footprint
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {stack.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#121A24] px-3 py-1.5 shadow-subtle transition hover:border-[#74B8CC]/40 hover:bg-[#16212E]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#74B8CC]" />
              <span className="text-xs font-semibold text-[#F4F8FA]">{item.name}</span>
              <span className="hidden sm:inline text-white/20">•</span>
              <span className="hidden sm:inline text-[11px] text-[#8FA6B5] font-mono">{item.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
