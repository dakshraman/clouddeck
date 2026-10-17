import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import { decodeMailParam, resolveMailEmail } from "@/app/api/mail/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ source: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { source: raw } = await ctx.params;
    const source = resolveMailEmail(decodeMailParam(raw));

    const deleted = await agentFetch<{ source: string; deleted: boolean }>(
      `/v1/mail/forwarders/${encodeURIComponent(source)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
