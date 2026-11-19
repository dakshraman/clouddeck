import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

/** Diagnose site defects and return health score + fixable issues. */
export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/doctor`, "POST");
  });
}

/** Also allow GET for convenience when fetching site diagnosis. */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/doctor`, "POST");
  });
}
