import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  json,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ zone: string }>;
}

async function resolveZone(ctx: RouteContext): Promise<string> {
  const { zone: raw } = await ctx.params;
  const zone = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(zone)) {
    throw new HttpError(400, "invalid zone name", "invalid_zone");
  }
  return zone;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const zone = await resolveZone(ctx);
    const deleted = await agentFetch<{ zone: string; deleted: boolean }>(
      `/v1/dns/zones/${encodeURIComponent(zone)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
