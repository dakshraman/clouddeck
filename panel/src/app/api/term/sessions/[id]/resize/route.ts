import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";
import { agentPassThrough, resolveTermDimension, resolveTermSessionId } from "@/app/api/term/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { id } = await ctx.params;
    const sessionId = resolveTermSessionId(id);

    const body = await parseJsonBody(req);
    const cols = resolveTermDimension(body.cols);
    const rows = resolveTermDimension(body.rows);

    return agentPassThrough(`/v1/term/sessions/${encodeURIComponent(sessionId)}/resize`, {
      method: "POST",
      body: { cols, rows },
    });
  });
}
