import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get system-wide aggregated traffic & visitor analytics across all sites. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const period = req.nextUrl.searchParams.get("period") || "24h";
    return proxyAgent(`/v1/system/analytics?period=${encodeURIComponent(period)}`, "GET");
  });
}
