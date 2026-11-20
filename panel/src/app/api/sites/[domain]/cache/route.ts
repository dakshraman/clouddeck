import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

/** Get site FastCGI microcaching status and settings. */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/cache`, "GET");
  });
}

/** Update site FastCGI microcaching configuration (toggle, TTL, bypass rules). */
export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/cache`, "PUT", body);
  });
}

/** Allow POST as an alias for updating cache settings. */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return PUT(req, ctx);
}
