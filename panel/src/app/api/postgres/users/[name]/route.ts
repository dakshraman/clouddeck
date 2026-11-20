import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ name: string }>;
}

/** Drop a PostgreSQL database user/role. */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { name } = await ctx.params;
    return proxyAgent(`/v1/postgres/users/${encodeURIComponent(name)}`, "DELETE");
  });
}
