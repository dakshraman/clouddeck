"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CornerDownLeft, Search, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { allNavItems, navGroups, type NavItem } from "@/components/nav-items";

interface Action extends NavItem {
  group: string;
}

const actions: Action[] = [
  ...navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
  {
    href: "/sites/new",
    label: "Create a new site",
    icon: allNavItems[1].icon,
    description: "Add a webroot and nginx vhost for a domain.",
    keywords: "add domain provision",
    group: "Actions",
  },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      if (isShortcut || isSlash) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) => {
      const haystack = `${action.label} ${action.description} ${action.keywords ?? ""} ${action.group}`.toLowerCase();
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const result of results) {
      const list = map.get(result.group) ?? [];
      list.push(result);
      map.set(result.group, list);
    }
    return Array.from(map.entries());
  }, [results]);

  function choose(action: Action) {
    setOpen(false);
    router.push(action.href);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter" && results[highlight]) {
      event.preventDefault();
      choose(results[highlight]);
    }
  }

  let flatIndex = -1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="group flex h-9 w-full max-w-md cursor-pointer items-center gap-2.5 rounded-full border border-border bg-input/50 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search size={15} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Search tools and pages</span>
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
            Ctrl /
          </kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-[12%] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 focus:outline-none"
          aria-label="Search"
        >
          <Dialog.Title className="sr-only">Search tools and pages</Dialog.Title>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            className="overflow-hidden rounded-xl border border-border bg-popover shadow-raised"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5">
              <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search tools, pages, and actions…"
                className="h-11 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                aria-label="Search"
              />
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Close search"
                >
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>

            <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No matches for “{query}”.
                </p>
              ) : (
                grouped.map(([groupLabel, items]) => (
                  <div key={groupLabel} className="mb-1">
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {groupLabel}
                    </p>
                    <ul>
                      {items.map((action) => {
                        flatIndex += 1;
                        const index = flatIndex;
                        const active = index === highlight;
                        const Icon = action.icon;
                        return (
                          <li key={`${action.group}-${action.href}-${action.label}`}>
                            <button
                              type="button"
                              onMouseEnter={() => setHighlight(index)}
                              onClick={() => choose(action)}
                              className={cn(
                                "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                                active ? "bg-accent text-accent-foreground" : "text-foreground/90",
                              )}
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground">
                                <Icon size={14} aria-hidden="true" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">{action.label}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {action.description}
                                </span>
                              </span>
                              <AnimatePresence>
                                {active ? (
                                  <motion.span
                                    initial={{ opacity: 0, x: -3 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                  >
                                    <CornerDownLeft size={13} />
                                  </motion.span>
                                ) : null}
                              </AnimatePresence>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ArrowRight size={11} aria-hidden="true" /> Navigate with ↑ ↓ · Enter to open
              </span>
              <span>Esc to close</span>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
