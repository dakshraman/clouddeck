import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { started } = await agentFetch<{ started: number }>("/v1/backups/schedule/run", {
      method: "POST",
    });
    return json({ started }, 202);
  });
}
