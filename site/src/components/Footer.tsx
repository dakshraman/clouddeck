export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#080C10] py-12 sm:py-16 text-[#8FA6B5]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand Column */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/favicon.svg"
                alt="CloudDeck"
                className="h-7 w-7 rounded-lg"
              />
              <span className="text-base font-semibold text-[#F4F8FA]">CloudDeck</span>
            </div>
            <p className="text-xs text-[#8FA6B5] leading-relaxed">
              Lightweight, open-source Linux hosting control panel and local development suite.
              Multi-PHP (8.1–8.4), MariaDB, Postfix/Dovecot, and PowerDNS in under 50MB RAM.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-xs font-mono font-medium text-[#F4F8FA] uppercase tracking-wider">Product</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-[#8FA6B5]">
              <li><a href="#architecture" className="hover:text-[#F4F8FA] transition-colors">System Architecture</a></li>
              <li><a href="#comparison" className="hover:text-[#F4F8FA] transition-colors">Platform Comparison</a></li>
              <li><a href="#local-dev" className="hover:text-[#F4F8FA] transition-colors">Local Dev Suite (WSL / Mac)</a></li>
              <li><a href="#features" className="hover:text-[#F4F8FA] transition-colors">Core Features</a></li>
              <li><a href="#install" className="hover:text-[#F4F8FA] transition-colors">Installation Guide</a></li>
              <li><a href="#faq" className="hover:text-[#F4F8FA] transition-colors">FAQ</a></li>
            </ul>
          </div>

          {/* Documentation Links */}
          <div>
            <h4 className="text-xs font-mono font-medium text-[#F4F8FA] uppercase tracking-wider">Documentation</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-[#8FA6B5]">
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/architecture.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  Architecture Overview
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/api.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  Agent API Contracts
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/local-development.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  Local Dev Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/docs/deployment.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  VPS Deployment
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  Security Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Developer Resources */}
          <div>
            <h4 className="text-xs font-mono font-medium text-[#F4F8FA] uppercase tracking-wider">Resources</h4>
            <ul className="mt-3.5 space-y-2.5 text-xs text-[#8FA6B5]">
              <li>
                <a
                  href="/llms.txt"
                  target="_blank"
                  className="hover:text-[#74B8CC] transition-colors font-mono"
                >
                  llms.txt Context
                </a>
              </li>
              <li>
                <a
                  href="/llms-full.txt"
                  target="_blank"
                  className="hover:text-[#F4F8FA] transition-colors font-mono"
                >
                  llms-full.txt Spec
                </a>
              </li>
              <li>
                <a
                  href="/pricing.md"
                  target="_blank"
                  className="hover:text-[#F4F8FA] transition-colors font-mono"
                >
                  pricing.md (Free FOSS)
                </a>
              </li>
              <li>
                <a
                  href="/AGENTS.md"
                  target="_blank"
                  className="hover:text-[#F4F8FA] transition-colors font-mono"
                >
                  AGENTS.md Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/dakshraman/clouddeck"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F4F8FA] transition-colors"
                >
                  GitHub Repository
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Strip */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 text-center text-xs text-[#546C7B] sm:flex-row sm:text-left">
          <p>© 2026 Daksh Raman. Released under the open-source MIT License.</p>
          <p className="font-mono text-[11px]">Next.js 16, React 19, Tailwind CSS &amp; Go stdlib</p>
        </div>
      </div>
    </footer>
  );
}
