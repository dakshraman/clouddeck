import { NextResponse } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get PostgreSQL daemon status, version, and socket/port bindings. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/postgres/status", "GET");
  });
}
