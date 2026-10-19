import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import { decodeFtpName, resolveFtpName } from "@/app/api/ftp/shared";
import type { FtpAccountsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { name: raw } = await ctx.params;
    const name = resolveFtpName(decodeFtpName(raw));

    // The agent answers with the full account list; the home directory is kept.
    return json(
      await agentFetch<FtpAccountsResponse>(`/v1/ftp/accounts/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    );
  });
}
