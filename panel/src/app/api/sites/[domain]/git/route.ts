import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 15000;

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

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git`, {
      method: "GET",
      headers: agentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new HttpError(res.status, "failed to get git configuration");
    }
    return json(await res.json());
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);
    const body = await parseJsonBody(req);

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git`, {
      method: "PUT",
      headers: agentHeaders("application/json"),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new HttpError(res.status, errData.message || "failed to save git configuration");
    }
    return json(await res.json());
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git`, {
      method: "DELETE",
      headers: agentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new HttpError(res.status, "failed to disconnect git repository");
    }
    return json(await res.json());
  });
}
