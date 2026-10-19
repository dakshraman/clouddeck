import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import { resolveSshKeyName } from "@/app/api/ssh/shared";
import type { SshGeneratedKey, SshGeneratedKeysResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { name: raw } = await ctx.params;
    const name = resolveSshKeyName(raw);

    return json(
      await agentFetch<{ key: SshGeneratedKey }>(
        `/v1/ssh/keys/generated/${encodeURIComponent(name)}`,
      ),
    );
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { name: raw } = await ctx.params;
    const name = resolveSshKeyName(raw);

    const remaining = await agentFetch<SshGeneratedKeysResponse>(
      `/v1/ssh/keys/generated/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    return json(remaining);
  });
}
