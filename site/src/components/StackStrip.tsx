export function StackStrip() {
  const stack = [
    { name: "Nginx 1.26", role: "High-Perf Edge Reverse Proxy" },
    { name: "Multi-PHP (8.1–8.4)", role: "Coexisting FPM Sockets" },
    { name: "MariaDB 11.4", role: "Native SQL with 1-Click Dumps" },
    { name: "PowerDNS", role: "SQLite Authoritative DNS" },
    { name: "Postfix & Dovecot", role: "Production Mail & RSA DKIM" },
    { name: "1-Click Panel SSL", role: "IP SANs + Let's Encrypt" },
    { name: "Next.js 15 & Go", role: "Zero-Root Web Architecture" },
  ];

  return (
    <div className="border-y border-[#D2ADAC]/40 bg-[#FAF7F5] py-6 sm:py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-semibold tracking-wider text-[#886351] uppercase">
          Production-Grade Bare Metal Stack • Zero Virtualization Overhead
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          {stack.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-full border border-[#D2ADAC]/60 bg-white/80 px-3.5 py-1.5 shadow-xs transition hover:border-[#6494AC] hover:bg-white"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#74B8CC]" />
              <span className="text-xs font-bold text-[#14242B]">{item.name}</span>
              <span className="hidden text-[10px] text-[#566E76] sm:inline">•</span>
              <span className="hidden text-[11px] text-[#566E76] sm:inline">{item.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

