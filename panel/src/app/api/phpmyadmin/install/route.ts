import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a background phpMyAdmin install; returns the 202 task envelope. */
export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const result = await agentFetch<{ task: Task }>("/v1/phpmyadmin/install", { method: "POST" });
    return json(result, 202);
  });
}
