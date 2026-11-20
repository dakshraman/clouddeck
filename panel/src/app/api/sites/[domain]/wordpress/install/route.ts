import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

/** 1-Click WordPress installation (auto database, user, wp-config, core install). */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/wordpress/install`, "POST", body);
  });
}
