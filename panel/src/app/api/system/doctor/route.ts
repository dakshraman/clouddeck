import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run host-wide diagnosis and return server health report. */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/system/doctor", "POST");
  });
}

/** Also allow GET for convenience when fetching system diagnosis. */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/system/doctor", "POST");
  });
}
