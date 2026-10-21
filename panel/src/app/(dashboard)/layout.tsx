import type { ReactNode } from "react";
import { Layers } from "lucide-react";
import { requireSession } from "@/lib/session";
import { Nav } from "@/components/nav";
import { PageTransition } from "@/components/page-transition";
import { PreferencesProvider } from "@/components/preferences";
import { Topbar } from "@/components/topbar";

// Auth + setup state are per-request; never prerender/cache this tree at
// build time (a build-time redirect to /setup would otherwise be frozen in).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();

  return (
    <PreferencesProvider>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Layers size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                CloudDeck
              </span>
              <span className="block truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                Hosting console
              </span>
            </span>
          </div>
          <Nav />
          <div className="shrink-0 border-t border-sidebar-border px-4 py-2.5">
            <p className="truncate text-[11px] text-sidebar-foreground/50">
              CloudDeck · self-hosted control panel
            </p>
          </div>
        </aside>

        <div className="pl-64">
          <Topbar username={user.username} />
          <main className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </PreferencesProvider>
  );
}
