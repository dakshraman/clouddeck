"use client";

import { motion } from "motion/react";
import { Check, Sparkles } from "lucide-react";

export function Comparison() {
  const rows = [
    {
      feature: "Monthly License Cost",
      benefit: "Keep 100% of your earnings",
      clouddeck: "$0 Free & Open Source (MIT)",
      cpanel: "$30–$60+/mo per server ($720/yr)",
      aapanel: "Freemium ($20/mo Pro)",
      coolify: "Free / $5/mo cloud",
    },
    {
      feature: "Server RAM Needed to Idle",
      benefit: "Host more sites on smaller servers",
      clouddeck: "< 50 MB (runs on a $4 VPS)",
      cpanel: "1.5 – 2.0+ GB idle overhead",
      aapanel: "500 MB – 800 MB idle",
      coolify: "500 MB – 1.0+ GB idle",
    },
    {
      feature: "Ease of Use & Interface",
      benefit: "No technical headaches",
      clouddeck: "Modern, clean 1-click dashboard",
      cpanel: "Cluttered 1990s legacy menus",
      aapanel: "Complex nested configurations",
      coolify: "Geared towards Docker engineers",
    },
    {
      feature: "WordPress & PHP Speed",
      benefit: "Instant visitor page loads",
      clouddeck: "Fast bare-metal Nginx sockets",
      cpanel: "Heavy Apache process overhead",
      aapanel: "Mixed container overhead",
      coolify: "Containerized PHP latency",
    },
    {
      feature: "Self-Healing Site Doctor",
      benefit: "Fixes errors automatically",
      clouddeck: "Built-in 1-click auto repairs",
      cpanel: "Manual SSH debugging required",
      aapanel: "None",
      coolify: "None",
    },
    {
      feature: "Free Auto-Renewing SSL",
      benefit: "Always secure HTTPS",
      clouddeck: "Automatic Wildcard & IP SANs",
      cpanel: "Basic AutoSSL",
      aapanel: "Manual setup required",
      coolify: "Traefik Let's Encrypt",
    },
    {
      feature: "Works on Mac & Windows",
      benefit: "Develop locally before deploying",
      clouddeck: "Native WSL 2 & macOS suite",
      cpanel: "Linux server only",
      aapanel: "Linux server only",
      coolify: "Linux server only",
    },
  ];

  return (
    <section id="comparison" className="border-t border-white/10 bg-[#080C10] py-16 sm:py-24 relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#74B8CC]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Honest Comparison</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F4F8FA] sm:text-4xl">
            Why people are switching to CloudDeck
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-[#8FA6B5]">
            Save hundreds of dollars every year while giving your websites better performance and simplified controls.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#0D131A] shadow-raised">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-[#080C10] text-[#8FA6B5]">
                  <th className="py-4 px-4 sm:px-6 font-semibold text-[#F4F8FA]">Capability &amp; Benefit</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-[#74B8CC] bg-[#74B8CC]/10">
                    <div className="flex items-center gap-2">
                      <img src="/assets/favicon.svg" alt="CloudDeck" className="h-4 w-4 rounded" />
                      <span>CloudDeck</span>
                    </div>
                  </th>
                  <th className="py-4 px-4 sm:px-6 font-medium">cPanel</th>
                  <th className="py-4 px-4 sm:px-6 font-medium">aaPanel</th>
                  <th className="py-4 px-4 sm:px-6 font-medium">Coolify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-semibold text-[#F4F8FA]">{row.feature}</div>
                      <div className="text-[11px] text-[#8FA6B5] mt-0.5">{row.benefit}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 font-medium text-[#F4F8FA] bg-[#74B8CC]/[0.04]">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-[#10B981]" />
                        <span>{row.clouddeck}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#8FA6B5]">{row.cpanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#8FA6B5]">{row.aapanel}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-[#8FA6B5]">{row.coolify}</td>
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
