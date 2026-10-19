import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireAuth } from "@/lib/http";
import { agentPassThrough, resolveTermSessionId } from "@/app/api/term/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { id } = await ctx.params;
    const sessionId = resolveTermSessionId(id);

    return agentPassThrough(`/v1/term/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  });
}
