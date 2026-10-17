import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { decodeDomainParam, handleRoute, json, requireAuth } from "@/lib/http";
import { resolveMailDomain } from "@/app/api/mail/shared";
import type { MailDKIMInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { domain: raw } = await ctx.params;
    const domain = resolveMailDomain(decodeDomainParam(raw));

    return json(
      await agentFetch<MailDKIMInfo>(`/v1/mail/dkim/${encodeURIComponent(domain)}`),
    );
  });
}
