import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import type { AgentService } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { name: raw } = await ctx.params;
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // Malformed escape sequence; the agent rejects unknown service names.
    }

    const service = await agentFetch<AgentService>(
      `/v1/services/${encodeURIComponent(name)}/restart`,
      { method: "POST" },
    );
    return json(service);
  });
}
