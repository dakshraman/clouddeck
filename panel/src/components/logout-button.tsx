"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton({ username }: { username: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Sign out locally even if the request fails.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold uppercase text-indigo-300">
        {username.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-200" title={username}>
        {username}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        onClick={signOut}
        loading={pending}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut size={16} />
      </Button>
    </div>
  );
}
