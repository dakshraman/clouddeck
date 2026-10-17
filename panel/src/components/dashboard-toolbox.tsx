import Link from "next/link";
import {
  Activity,
  Archive,
  Database,
  Globe,
  Network,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface Tool {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface ToolSection {
  id: string;
  title: string;
  tools: Tool[];
}

const sections: ToolSection[] = [
  {
    id: "sites",
    title: "Sites & Domains",
    tools: [
      {
        href: "/sites",
        label: "Sites",
        description: "Domains hosted on this server.",
        icon: Globe,
      },
      {
        href: "/sites/new",
        label: "New site",
        description: "Add a webroot and nginx vhost for a domain.",
        icon: Plus,
      },
      {
        href: "/dns",
        label: "DNS",
        description: "PowerDNS zones and records.",
        icon: Network,
      },
    ],
  },
  {
    id: "data",
    title: "Data & Storage",
    tools: [
      {
        href: "/databases",
        label: "Databases",
        description: "MariaDB/MySQL databases and users.",
        icon: Database,
      },
      {
        href: "/backups",
        label: "Backups",
        description: "Archives to create, restore, and download.",
        icon: Archive,
      },
    ],
  },
  {
    id: "server",
    title: "Monitoring & System",
    tools: [
      {
        href: "/monitoring",
        label: "Monitoring",
        description: "Host metrics and web-stack services.",
        icon: Activity,
      },
      {
        href: "/settings",
        label: "Settings",
        description: "Account and server information.",
        icon: Settings,
      },
    ],
  },
];

export function DashboardToolbox() {
  return (
    <div className="grid gap-6">
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`toolbox-${section.id}`}>
          <h2
            id={`toolbox-${section.id}`}
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {section.title}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  aria-label={`${tool.label}: ${tool.description}`}
                  className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F17]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300 transition-colors group-hover:bg-indigo-500/15">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200 transition-colors group-hover:text-slate-100">
                      {tool.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      {tool.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
