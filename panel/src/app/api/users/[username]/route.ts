import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ username: string }>;
}

/** Update user role, assigned domains, password, or quota limits. */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { username } = await ctx.params;
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/users/${encodeURIComponent(username)}`, "PUT", body);
  });
}

/** Delete a sub-account user. */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { username } = await ctx.params;
    return proxyAgent(`/v1/users/${encodeURIComponent(username)}`, "DELETE");
  });
}
