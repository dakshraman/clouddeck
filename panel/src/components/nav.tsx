"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isNavItemActive, navGroups } from "@/components/nav-items";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  sidebarGroupLabelClass,
  useSidebar,
} from "@/components/ui/sidebar";

const STORAGE_KEY = "clouddeck.nav.groups";

function loadOpenState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function Nav() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  const expanded = state === "expanded" || isMobile;

  const activeGroupId = useMemo(
    () => navGroups.find((group) => group.items.some((item) => isNavItemActive(pathname, item.href)))?.id,
    [pathname],
  );

  useEffect(() => {
    setOpenState(loadOpenState());
    setReady(true);
  }, []);

  // Always reveal the group that owns the active route.
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenState((prev) => (prev[activeGroupId] === false ? { ...prev, [activeGroupId]: true } : prev));
  }, [activeGroupId, ready]);

  function toggle(groupId: string, currentlyOpen: boolean) {
    setOpenState((prev) => {
      const next = { ...prev, [groupId]: !currentlyOpen };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable; group state is session-only.
      }
      return next;
    });
  }

  function closeMobile() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <nav className="py-1" aria-label="Main navigation">
      {navGroups.map((group) => {
        const open = expanded ? (openState[group.id] ?? true) : true;
        const groupActive = group.items.some((item) => isNavItemActive(pathname, item.href));
        return (
          <SidebarGroup key={group.id} className="py-1">
            <button
              type="button"
              onClick={() => toggle(group.id, open)}
              aria-expanded={open}
              className={cn(
                sidebarGroupLabelClass,
                "cursor-pointer hover:text-sidebar-foreground",
                groupActive && "text-sidebar-foreground",
              )}
            >
              <span>{group.label}</span>
              <ChevronRight
                size={12}
                className={cn("ml-auto transition-transform", open && "rotate-90")}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence initial={false}>
              {open || !ready ? (
                <motion.div
                  key={`${group.id}-items`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden"
                >
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = isNavItemActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              onClick={closeMobile}
                            >
                              <Icon
                                className={cn(
                                  active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate group-data-[collapsible=icon]/sidebar:hidden">
                                {item.label}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </SidebarGroup>
        );
      })}
    </nav>
  );
}
