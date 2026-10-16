import type { ReactNode } from "react";
import { Layers } from "lucide-react";
import { requireSession } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";
import { Nav } from "@/components/nav";
import { Topbar } from "@/components/topbar";

// Auth + setup state are per-request; never prerender/cache this tree at
// build time (a build-time redirect to /setup would otherwise be frozen in).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-800 bg-[#0B0F17]">
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-800 px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <Layers size={15} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">CloudDeck</span>
        </div>
        <Nav />
        <div className="shrink-0 border-t border-slate-800 p-2">
          <LogoutButton username={user.username} />
        </div>
      </aside>

      <div className="pl-60">
        <Topbar />
        <main className="mx-auto max-w-6xl px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
