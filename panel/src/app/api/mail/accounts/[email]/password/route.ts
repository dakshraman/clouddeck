import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { decodeMailParam, resolveMailEmail, resolveMailPassword } from "@/app/api/mail/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ email: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { email: raw } = await ctx.params;
    const email = resolveMailEmail(decodeMailParam(raw));

    const body = await parseJsonBody(req);
    const password = resolveMailPassword(body.password);

    const updated = await agentFetch<{ email: string; updated: boolean }>(
      `/v1/mail/accounts/${encodeURIComponent(email)}/password`,
      { method: "POST", body: { password } },
    );
    return json(updated);
  });
}
