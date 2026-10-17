import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { decodeDomainParam, handleRoute, json, requireAuth } from "@/lib/http";
import { resolveMailDomain } from "@/app/api/mail/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { domain: raw } = await ctx.params;
    const domain = resolveMailDomain(decodeDomainParam(raw));

    const deleted = await agentFetch<{ domain: string; deleted: boolean }>(
      `/v1/mail/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
