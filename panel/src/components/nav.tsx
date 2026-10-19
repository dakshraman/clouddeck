"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Archive, Clock, CloudUpload, Database, FolderOpen, Globe, KeyRound, LayoutDashboard, Mail, Network, Settings, SquareTerminal, type LucideIcon } from "lucide-react";
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
    href: "/mail",
    label: "Mail",
    icon: Mail,
    isActive: (pathname) => pathname === "/mail" || pathname.startsWith("/mail/"),
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
  {
    href: "/files",
    label: "Files",
    icon: FolderOpen,
    isActive: (pathname) => pathname === "/files" || pathname.startsWith("/files/"),
  },
  {
    href: "/ftp",
    label: "FTP",
    icon: CloudUpload,
    isActive: (pathname) => pathname === "/ftp" || pathname.startsWith("/ftp/"),
  },
  {
    href: "/cron",
    label: "Cron Jobs",
    icon: Clock,
    isActive: (pathname) => pathname === "/cron" || pathname.startsWith("/cron/"),
  },
  {
    href: "/terminal",
    label: "Terminal",
    icon: SquareTerminal,
    isActive: (pathname) => pathname === "/terminal" || pathname.startsWith("/terminal/"),
  },
  {
    href: "/ssh",
    label: "SSH",
    icon: KeyRound,
    isActive: (pathname) => pathname === "/ssh" || pathname.startsWith("/ssh/"),
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
