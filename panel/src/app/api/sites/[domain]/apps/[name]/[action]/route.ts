import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string; name: string; action: string }>;
}

const ACTIONS = new Set(["start", "stop"]);

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: rawDomain, name: rawName, action } = await ctx.params;
    const domain = decodeDomainParam(rawDomain);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    const name = decodeURIComponent(rawName).toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(name)) {
      throw new HttpError(400, "invalid app name");
    }
    if (!ACTIONS.has(action)) {
      throw new HttpError(400, "unsupported action");
    }
    return proxyAgent(
      `/v1/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(name)}/${action}`,
      "POST",
    );
  });
}
