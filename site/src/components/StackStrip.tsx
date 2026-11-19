export function StackStrip() {
  const stack = [
    { name: "8 AI Coding Agents", role: "Claude, Codex, Ollama, Hermes" },
    { name: "Site Doctor & Auto-Fix", role: "0-100 Score & 1-Click Repair" },
    { name: "Multi-PHP (8.1–8.4)", role: "Coexisting FPM Sockets" },
    { name: "Visual Cron & php.ini", role: "Crontab Presets & Ext Toggles" },
    { name: "MariaDB 11.4", role: "Native SQL with 1-Click Dumps" },
    { name: "PowerDNS", role: "SQLite Authoritative DNS" },
    { name: "Postfix & Dovecot", role: "Production Mail & RSA DKIM" },
    { name: "Next.js 16 & Go", role: "<50MB RAM Zero-Root Core" },
  ];

  return (
    <div className="border-y border-white/5 bg-[#0A0F17]/80 py-6 sm:py-7 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-[11px] font-mono tracking-wider text-slate-500 uppercase">
          AI-Native Bare Metal Architecture &bull; Zero Virtualization Overhead &bull; Under 50MB RAM
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {stack.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-[#121822] px-3.5 py-1.5 shadow-sm transition hover:border-[#38BDF8]/40 hover:bg-[#17212F]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
              <span className="text-xs font-bold text-slate-200">{item.name}</span>
              <span className="hidden sm:inline text-[10px] text-slate-600">•</span>
              <span className="hidden sm:inline text-[11px] text-slate-400 font-mono">{item.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
