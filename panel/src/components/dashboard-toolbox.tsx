"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  Clock,
  CloudUpload,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
  Mail,
  Network,
  Plus,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

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
    id: "web",
    title: "Web",
    tools: [
      { href: "/sites", label: "Sites", description: "Domains hosted on this server.", icon: Globe },
      { href: "/sites/new", label: "New site", description: "Add a webroot and nginx vhost.", icon: Plus },
      { href: "/files", label: "Files", description: "Browse and edit document roots.", icon: FolderOpen },
      { href: "/ftp", label: "FTP", description: "FTP accounts and access.", icon: CloudUpload },
    ],
  },
  {
    id: "data",
    title: "Data",
    tools: [
      { href: "/databases", label: "Databases", description: "MariaDB databases and users.", icon: Database },
      { href: "/dns", label: "DNS", description: "PowerDNS zones and records.", icon: Network },
      { href: "/backups", label: "Backups", description: "Create, download, and restore archives.", icon: Archive },
    ],
  },
  {
    id: "email",
    title: "Email",
    tools: [{ href: "/mail", label: "Mail", description: "Mail domains, accounts, and forwarders.", icon: Mail }],
  },
  {
    id: "system",
    title: "System",
    tools: [
      { href: "/monitoring", label: "Monitoring", description: "Host metrics and web-stack services.", icon: Activity },
      { href: "/cron", label: "Cron Jobs", description: "Scheduled tasks per site.", icon: Clock },
      { href: "/terminal", label: "Terminal", description: "In-browser shell on the server.", icon: SquareTerminal },
      { href: "/ssh", label: "SSH", description: "Authorized SSH keys.", icon: KeyRound },
    ],
  },
  {
    id: "preferences",
    title: "Preferences",
    tools: [
      { href: "/settings", label: "Settings", description: "Account and server information.", icon: Settings },
    ],
  },
];

export function DashboardToolbox() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="grid gap-4">
      {sections.map((section) => {
        const isCollapsed = collapsed[section.id] ?? false;
        return (
          <section
            key={section.id}
            aria-labelledby={`toolbox-${section.id}`}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-subtle"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
              <h2
                id={`toolbox-${section.id}`}
                className="text-[13px] font-semibold tracking-tight text-card-foreground"
              >
                {section.title}
              </h2>
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${section.title} tools`}
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <motion.span
                  animate={{ rotate: isCollapsed ? 0 : 90 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="flex"
                  aria-hidden="true"
                >
                  <ChevronRight size={14} />
                </motion.span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {!isCollapsed ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden"
                >
                  <ul className="grid gap-1.5 p-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {section.tools.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <li key={tool.href}>
                          <Link
                            href={tool.href}
                            aria-label={`${tool.label}: ${tool.description}`}
                            className={cn(
                              "group flex items-start gap-3 rounded-lg border border-transparent p-2.5 transition-colors",
                              "hover:border-border hover:bg-accent/60",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                          >
                            <motion.span
                              whileHover={{ scale: 1.05, rotate: -2 }}
                              transition={{ type: "spring", stiffness: 500, damping: 22 }}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-brand"
                            >
                              <Icon size={16} aria-hidden="true" />
                            </motion.span>
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium text-card-foreground">
                                {tool.label}
                              </span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                {tool.description}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
