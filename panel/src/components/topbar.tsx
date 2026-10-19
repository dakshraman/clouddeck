"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, LogOut, Plus, Settings, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/components/ui/cn";

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
};

function crumbsFor(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return ["Dashboard"];
  return segments.map((segment) => segmentLabels[segment] ?? decodeURIComponent(segment));
}

export function Topbar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = crumbsFor(pathname);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Sign out locally even if the request fails.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-topbar/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-5 lg:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <span key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-2">
                {index > 0 ? (
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
                ) : null}
                <span
                  className={cn(
                    "truncate",
                    last ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {crumb}
                </span>
              </span>
            );
          })}
        </nav>

        <div className="ml-auto hidden min-w-0 flex-1 justify-center px-4 md:flex">
          <CommandPalette />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <Link href="/sites/new" className={buttonClass("outline", "sm")}>
            <Plus size={14} aria-hidden="true" />
            New site
          </Link>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label={`Account menu for ${username}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold uppercase text-foreground/90">
                  {username.slice(0, 1)}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm text-foreground/90 sm:block">
                  {username}
                </span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-raised data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
              >
                <DropdownMenu.Label className="px-2.5 py-2">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                    Signed in as
                  </span>
                  <span className="block truncate text-sm font-medium text-foreground">{username}</span>
                </DropdownMenu.Label>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item asChild>
                  <Link
                    href="/settings"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground/90 outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    <Settings size={14} className="text-muted-foreground" aria-hidden="true" />
                    Account settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link
                    href="/ssh"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground/90 outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    <UserRound size={14} className="text-muted-foreground" aria-hidden="true" />
                    SSH keys
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={() => void signOut()}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-red-400 outline-none transition-colors data-[highlighted]:bg-destructive/15 data-[highlighted]:text-red-300"
                >
                  <LogOut size={14} aria-hidden="true" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="border-t border-border/60 px-5 py-2 md:hidden">
        <CommandPalette />
      </div>
    </header>
  );
}
