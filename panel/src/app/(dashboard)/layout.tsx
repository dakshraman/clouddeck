import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/session";
import { getUserProfile } from "@/lib/users";
import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { PreferencesProvider } from "@/components/preferences";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

// Auth + setup state are per-request; never prerender/cache this tree at
// build time (a build-time redirect to /setup would otherwise be frozen in).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  const profile = getUserProfile(user.username);
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={200}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar username={user.username} email={profile?.email ?? null} />
          <SidebarInset>
            <Topbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-5 lg:px-8">
              <PageTransition>{children}</PageTransition>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </PreferencesProvider>
  );
}
