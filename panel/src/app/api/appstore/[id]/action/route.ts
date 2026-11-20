import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Execute container lifecycle actions (start, stop, restart, upgrade). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/appstore/${encodeURIComponent(id)}/action`, "POST", body, 60000);
  });
}
