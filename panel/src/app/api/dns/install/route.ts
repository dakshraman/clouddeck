import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const task = await agentFetch<{ task: Task }>("/v1/dns/install", { method: "POST" });
    return json(task, 202);
  });
}

