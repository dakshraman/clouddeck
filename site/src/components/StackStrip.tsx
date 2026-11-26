export function StackStrip() {
  const stack = [
    { title: "Runs on 1GB VPS", subtitle: "Under 50MB idle RAM" },
    { title: "One-Click Apps", subtitle: "WordPress, Ghost & n8n" },
    { title: "Automatic Free SSL", subtitle: "Wildcard Let's Encrypt" },
    { title: "Fast Multi-PHP", subtitle: "PHP 8.1 through 8.4" },
    { title: "MariaDB & Postgres", subtitle: "Instant database creation" },
    { title: "Built-in Email", subtitle: "Custom domain mailboxes" },
    { title: "Zero-Root Safety", subtitle: "Unprivileged web process" },
    { title: "Universal Installer", subtitle: "Ubuntu, Debian, Mac & Win" },
  ];

  return (
    <div className="border-y border-white/10 bg-[#080C10] py-6 sm:py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <span className="text-xs font-semibold tracking-wider uppercase text-[#74B8CC]">
            Engineered for simplicity and high performance
          </span>
          <p className="mt-1 text-sm text-[#8FA6B5]">
            Everything you need to host professional websites and web apps on your own server.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stack.map((item) => (
            <div
              key={item.title}
              className="flex flex-col justify-center rounded-xl border border-white/10 bg-[#0D131A] p-3.5 shadow-subtle hover:border-[#74B8CC]/40 hover:bg-[#121A22] transition-all hover:-translate-y-0.5"
            >
              <span className="text-xs sm:text-sm font-semibold text-[#F4F8FA]">{item.title}</span>
              <span className="text-[11px] text-[#8FA6B5] mt-0.5">{item.subtitle}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
