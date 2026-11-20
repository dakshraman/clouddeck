import { NextResponse } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get history of cPanel and offsite migrations. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/migrations/history", "GET");
  });
}
