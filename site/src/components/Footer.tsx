export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#06090D] py-12 sm:py-16 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#38BDF8] to-[#0284C7] text-[#080C10] shadow-md shadow-[#38BDF8]/20">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>
              <span className="text-base font-bold text-white">CloudDeck</span>
              <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/10 px-2 py-0.5 text-[10px] font-mono font-medium text-[#10B981]">
                v0.6.54
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The modern, blazing-fast, open-source Linux hosting control panel and local development suite.
              Orchestrates 8 native AI coding agents, autonomous Site Doctor, Cron manager, and multi-PHP in &lt;50MB RAM.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">Product</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
              <li><a href="#features" className="hover:text-white transition-colors">Core Features</a></li>
              <li><a href="#ai-agents" className="hover:text-[#38BDF8] transition-colors">AI Agents &amp; Doctor</a></li>
              <li><a href="#under-the-hood" className="hover:text-white transition-colors">Under the Hood</a></li>
              <li><a href="#comparison" className="hover:text-white transition-colors">cPanel Comparison Matrix</a></li>
              <li><a href="#local-dev" className="hover:text-white transition-colors">Local Dev Suite (WSL / Mac)</a></li>
              <li><a href="#install" className="hover:text-white transition-colors">Installation Guide</a></li>
            </ul>
          </div>

          {/* Documentation Links */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">Documentation</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/architecture.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Architecture Overview
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/api.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  API Contracts
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/local-development.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Local Dev Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/deployment.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Production VPS Deployment
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Security Policy
                </a>
              </li>
            </ul>
          </div>

          {/* AI & Open Source */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">AI &amp; Machine Context</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
              <li>
                <a
                  href="/llms.txt"
                  target="_blank"
                  className="hover:text-[#38BDF8] transition-colors font-mono text-[#38BDF8]"
                >
                  llms.txt Context
                </a>
              </li>
              <li>
                <a
                  href="/llms-full.txt"
                  target="_blank"
                  className="hover:text-white transition-colors font-mono"
                >
                  llms-full.txt Deep Dive
                </a>
              </li>
              <li>
                <a
                  href="/pricing.md"
                  target="_blank"
                  className="hover:text-white transition-colors font-mono"
                >
                  pricing.md ($0 Free FOSS)
                </a>
              </li>
              <li>
                <a
                  href="/AGENTS.md"
                  target="_blank"
                  className="hover:text-white transition-colors font-mono"
                >
                  AGENTS.md Machine Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GitHub Repository (v0.6.54)
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Strip */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 text-center text-xs text-slate-500 sm:flex-row sm:text-left">
          <p>© 2026 Raman Daksh. Released under Open Source MIT License.</p>
          <p className="font-mono text-[11px]">Built with Next.js 16, React 19, Tailwind CSS &amp; Go stdlib &bull; v0.6.54</p>
        </div>
      </div>
    </footer>
  );
}
