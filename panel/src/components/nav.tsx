"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { isNavItemActive, navGroups } from "@/components/nav-items";

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
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

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
  }, [activeGroupId]);

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

  return (
    <LayoutGroup>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main navigation">
        {navGroups.map((group) => {
          const open = openState[group.id] ?? true;
          const groupActive = group.items.some((item) => isNavItemActive(pathname, item.href));
          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggle(group.id, open)}
                aria-expanded={open}
                className={cn(
                  "group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  groupActive ? "text-sidebar-foreground" : "text-sidebar-foreground/55",
                  "hover:text-sidebar-foreground",
                )}
              >
                <motion.span
                  animate={{ rotate: open ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="flex h-3.5 w-3.5 items-center justify-center"
                  aria-hidden="true"
                >
                  <ChevronRight size={12} />
                </motion.span>
                {group.label}
              </button>

              <AnimatePresence initial={false}>
                {open || !ready ? (
                  <motion.ul
                    key={`${group.id}-items`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    {group.items.map((item) => {
                      const active = isNavItemActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                              active
                                ? "bg-sidebar-accent text-white"
                                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                            )}
                          >
                            {active ? (
                              <motion.span
                                layoutId="nav-active-bar"
                                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                                className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                            <Icon
                              size={15}
                              className={cn("shrink-0", active ? "text-primary" : "text-sidebar-foreground/60")}
                              aria-hidden="true"
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
