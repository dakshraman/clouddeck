import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string; name: string }>;
}

async function resolve(ctx: RouteContext): Promise<{ domain: string; name: string }> {
  const { domain: rawDomain, name: rawName } = await ctx.params;
  const domain = decodeDomainParam(rawDomain);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  const name = decodeURIComponent(rawName).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(name)) {
    throw new HttpError(400, "invalid app name");
  }
  return { domain, name };
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain, name } = await resolve(ctx);
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(name)}`, "GET");
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain, name } = await resolve(ctx);
    const body = await parseJsonBody(req);
    return proxyAgent(
      `/v1/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(name)}`,
      "PUT",
      body,
    );
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain, name } = await resolve(ctx);
    return proxyAgent(
      `/v1/sites/${encodeURIComponent(domain)}/apps/${encodeURIComponent(name)}`,
      "DELETE",
    );
  });
}
