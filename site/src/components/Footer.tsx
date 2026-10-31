export function Footer() {
  const palette = [
    { name: "Sky Teal", hex: "#74B8CC" },
    { name: "Marine Teal", hex: "#235361" },
    { name: "Peach Accent", hex: "#FAAA93" },
    { name: "Steel Teal", hex: "#6494AC" },
    { name: "Warm Chestnut", hex: "#886351" },
    { name: "Soft Mauve", hex: "#D2ADAC" },
  ];

  return (
    <footer className="border-t border-[#D2ADAC]/40 bg-[#F4EFEB] py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#235361] text-[#74B8CC]">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <span className="text-base font-bold text-[#14242B]">CloudDeck</span>
            </div>
            <p className="text-xs text-[#566E76] leading-relaxed">
              The modern, blazing-fast, open-source Linux hosting control panel and local development suite.
              Consumes under 50MB idle RAM with zero root web processes.
            </p>
            <div className="flex items-center gap-1.5 pt-1">
              {palette.map((c) => (
                <span
                  key={c.hex}
                  title={`${c.name}: ${c.hex}`}
                  className="h-3 w-3 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-xs font-bold text-[#14242B] uppercase tracking-wider">Product</h4>
            <ul className="mt-3 space-y-2 text-xs text-[#566E76]">
              <li><a href="#features" className="hover:text-[#235361] transition">Core Features</a></li>
              <li><a href="#under-the-hood" className="hover:text-[#235361] transition">Under the Hood</a></li>
              <li><a href="#comparison" className="hover:text-[#235361] transition">cPanel Comparison Matrix</a></li>
              <li><a href="#local-dev" className="hover:text-[#235361] transition">Local Dev Suite (WSL / Mac)</a></li>
              <li><a href="#install" className="hover:text-[#235361] transition">Installation Guide</a></li>
            </ul>
          </div>

          {/* Documentation Links */}
          <div>
            <h4 className="text-xs font-bold text-[#14242B] uppercase tracking-wider">Documentation</h4>
            <ul className="mt-3 space-y-2 text-xs text-[#566E76]">
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/architecture.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Architecture Overview
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/api.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  API Contracts
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/local-development.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Local Dev Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/deployment.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Production VPS Deployment
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Security Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Open Source */}
          <div>
            <h4 className="text-xs font-bold text-[#14242B] uppercase tracking-wider">Open Source</h4>
            <ul className="mt-3 space-y-2 text-xs text-[#566E76]">
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Releases (v0.6.27)
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#235361] transition"
                >
                  Issue Tracker
                </a>
              </li>
              <li>
                <a
                  href="/llms.txt"
                  target="_blank"
                  className="hover:text-[#235361] transition"
                >
                  llms.txt Specification
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Strip */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#D2ADAC]/40 pt-6 text-center text-xs text-[#8B9FA6] sm:flex-row sm:text-left">
          <p>© 2026 Daksh Raman. Released under Open Source License.</p>
          <p>Crafted with Next.js 15, React 19, Tailwind CSS &amp; Go stdlib.</p>
        </div>
      </div>
    </footer>
  );
}

