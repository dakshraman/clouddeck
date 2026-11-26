export function StackStrip() {
  const stack = [
    { name: "< 48 MB RAM", role: "Lightweight Go stdlib daemon" },
    { name: "Zero-Root Web Panel", role: "Unprivileged user on port 2083" },
    { name: "Multi-PHP Coexistence", role: "PHP 8.1, 8.2, 8.3, 8.4 sockets" },
    { name: "MariaDB & PostgreSQL", role: "Native engines with instant dumps" },
    { name: "Production Mail Stack", role: "Postfix + Dovecot + RSA-2048 DKIM" },
    { name: "Authoritative DNS", role: "PowerDNS SQLite & MySQL backends" },
    { name: "WAF & Security", role: "ModSecurity OWASP & Fail2ban" },
    { name: "Developer AI Agents", role: "Local CLI & Claude Code launcher" },
  ];

  return (
    <div className="border-y border-white/10 bg-[#080C10] py-5 sm:py-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-mono text-[#8FA6B5]">
          Engineered for bare-metal performance, low resource consumption, and zero root web exposure
        </p>

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          {stack.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0D131A] px-3 py-1.5 shadow-subtle hover:border-[#74B8CC]/40 hover:bg-[#121A22] transition-colors"
            >
              <span className="text-xs font-medium text-[#F4F8FA]">{item.name}</span>
              <span className="hidden sm:inline text-white/20">/</span>
              <span className="hidden sm:inline text-[11px] text-[#8FA6B5] font-mono">{item.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
