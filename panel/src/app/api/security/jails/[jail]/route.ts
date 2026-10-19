import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jail: string }>;
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { jail: raw } = await ctx.params;
    const jail = decodeURIComponent(raw);
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(jail)) {
      throw new HttpError(400, "invalid jail name");
    }
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/security/jails/${encodeURIComponent(jail)}`, "PUT", body);
  });
}
