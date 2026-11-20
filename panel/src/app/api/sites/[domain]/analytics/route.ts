import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

/** Get visitor & traffic analytics parsed from Nginx access logs for a specific domain. */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);
    const period = req.nextUrl.searchParams.get("period") || "24h";
    return proxyAgent(
      `/v1/sites/${encodeURIComponent(domain)}/analytics?period=${encodeURIComponent(period)}`,
      "GET",
    );
  });
}
