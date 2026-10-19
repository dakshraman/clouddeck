import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    const ruleID = decodeURIComponent(id);
    if (!/^[a-z0-9]+$/.test(ruleID)) {
      throw new HttpError(400, "invalid rule id");
    }
    return proxyAgent(`/v1/firewall/rules/${encodeURIComponent(ruleID)}`, "DELETE");
  });
}
