import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toggle Redis service start/stop. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    let body: Record<string, unknown> | undefined;
    try {
      body = await parseJsonBody(req);
    } catch {
      body = undefined;
    }
    return proxyAgent("/v1/caching/redis/toggle", "POST", body ?? {});
  });
}
