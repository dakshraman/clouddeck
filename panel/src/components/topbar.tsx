"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

const segmentLabels: Record<string, string> = {
  sites: "Sites",
  new: "New site",
  settings: "Settings",
  files: "Files",
  ftp: "FTP",
  dns: "DNS",
  mail: "Mail",
  databases: "Databases",
  backups: "Backups",
  monitoring: "Monitoring",
  cron: "Cron Jobs",
  terminal: "Terminal",
  ssh: "SSH",
  apps: "Applications",
  security: "Security",
};

interface Crumb {
  label: string;
  href: string | null;
}

function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Dashboard", href: null }];

  return segments.map((segment, index) => ({
    label: segmentLabels[segment] ?? decodeURIComponent(segment),
    href: index === segments.length - 1 ? null : `/${segments.slice(0, index + 1).join("/")}`,
  }));
}

export function Topbar() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md md:top-2 md:rounded-t-2xl">
      <div className="flex h-14 items-center gap-2 px-3 lg:px-4">
        <SidebarTrigger className="-ml-1" />
        <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 ? (
                <ChevronRight
                  size={14}
                  className="shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>

        {!isMobile ? (
          <div className="ml-auto flex min-w-0 flex-1 justify-center px-4">
            <CommandPalette />
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <Link href="/sites/new" className={buttonClass("outline", "sm")}>
            <Plus size={14} aria-hidden="true" />
            <span className="hidden sm:inline">New site</span>
            <span className="sr-only sm:hidden">New site</span>
          </Link>
        </div>
      </div>

      {isMobile ? (
        <div className="border-t border-border/60 px-3 py-2">
          <CommandPalette />
        </div>
      ) : null}
    </header>
  );
}
