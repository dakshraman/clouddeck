"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Archive, Database, Globe, LayoutDashboard, Network, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

const items: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/sites",
    label: "Sites",
    icon: Globe,
    isActive: (pathname) => pathname === "/sites" || pathname.startsWith("/sites/"),
  },
  {
    href: "/databases",
    label: "Databases",
    icon: Database,
    isActive: (pathname) => pathname === "/databases" || pathname.startsWith("/databases/"),
  },
  {
    href: "/dns",
    label: "DNS",
    icon: Network,
    isActive: (pathname) => pathname === "/dns" || pathname.startsWith("/dns/"),
  },
  {
    href: "/backups",
    label: "Backups",
    icon: Archive,
    isActive: (pathname) => pathname === "/backups" || pathname.startsWith("/backups/"),
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    isActive: (pathname) => pathname === "/monitoring" || pathname.startsWith("/monitoring/"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    isActive: (pathname) => pathname === "/settings" || pathname.startsWith("/settings/"),
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-slate-800/70 text-slate-100"
                : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
            )}
          >
            <Icon size={16} className={active ? "text-indigo-400" : "text-slate-400"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
