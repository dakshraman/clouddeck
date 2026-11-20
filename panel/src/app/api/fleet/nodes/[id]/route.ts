import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Get a single fleet node's status and telemetry. */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    return proxyAgent(`/v1/fleet/nodes/${encodeURIComponent(id)}`, "GET");
  });
}

/** Update node metadata or authentication key. */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/fleet/nodes/${encodeURIComponent(id)}`, "PUT", body);
  });
}

/** Remove a server node from the fleet cluster. */
export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    return proxyAgent(`/v1/fleet/nodes/${encodeURIComponent(id)}`, "DELETE");
  });
}
