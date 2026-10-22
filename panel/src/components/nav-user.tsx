"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import { ChevronsUpDown, KeyRound, LogOut, Palette, Settings } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const itemClass =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/90 outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

export function NavUser({ username, email }: { username: string; email: string | null }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);
  const initial = username.slice(0, 1).toUpperCase();

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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <SidebarMenuButton
              size="lg"
              className="aria-expanded:bg-sidebar-accent"
              aria-label={`Account menu for ${username}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                {initial}
              </span>
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]/sidebar:hidden">
                <span className="truncate font-medium text-sidebar-foreground">{username}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {email ?? "Panel administrator"}
                </span>
              </span>
              <ChevronsUpDown
                size={14}
                className="ml-auto text-sidebar-foreground/50 group-data-[collapsible=icon]/sidebar:hidden"
                aria-hidden="true"
              />
            </SidebarMenuButton>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-2xl shadow-black/40 ring-1 ring-border/60 backdrop-blur-xl"
            >
              <DropdownMenu.Label className="p-1">
                <span className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand/10 text-xs font-semibold text-brand">
                    {initial}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {username}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {email ?? "Panel administrator"}
                    </span>
                  </span>
                </span>
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <Link href="/settings" className={itemClass}>
                  <Settings size={15} className="text-muted-foreground" aria-hidden="true" />
                  Account settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/settings#appearance" className={itemClass}>
                  <Palette size={15} className="text-muted-foreground" aria-hidden="true" />
                  Appearance
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild>
                <Link href="/ssh" className={itemClass}>
                  <KeyRound size={15} className="text-muted-foreground" aria-hidden="true" />
                  SSH keys
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={() => void signOut()}
                className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-400 outline-none transition-colors data-[highlighted]:bg-destructive/15 data-[highlighted]:text-red-300"
              >
                <LogOut size={15} aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
