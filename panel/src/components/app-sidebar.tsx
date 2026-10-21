"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { Nav } from "@/components/nav";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar({ username, email }: { username: string; email: string | null }) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="pr-12 md:pr-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="CloudDeck">
              <Link href="/" aria-label="CloudDeck dashboard">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                  <Layers size={16} aria-hidden="true" />
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]/sidebar:hidden">
                  <span className="truncate text-sm font-semibold tracking-tight">CloudDeck</span>
                  <span className="truncate text-[11px] text-sidebar-foreground/60">
                    Hosting console
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <Nav />
      </SidebarContent>

      <SidebarFooter>
        <NavUser username={username} email={email} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
