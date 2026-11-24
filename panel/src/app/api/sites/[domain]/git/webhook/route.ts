import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
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

/**
 * GET /api/sites/[domain]/git/webhook
 * Returns the deploy webhook token and webhook URL.
 */
export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git/webhook-info`, {
      method: "GET",
      headers: agentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new HttpError(res.status, errData.message || "failed to get webhook info");
    }
    return json(await res.json());
  });
}

/**
 * POST /api/sites/[domain]/git/webhook
 * Triggers deployment release via webhook token (query param or X-Deploy-Token).
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      return NextResponse.json({ error: "invalid domain name" }, { status: 400 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const query = token ? `?token=${encodeURIComponent(token)}` : "";

    const forwardedHeaders: Record<string, string> = {
      "Content-Type": req.headers.get("content-type") || "application/json",
    };
    const xDeployToken = req.headers.get("x-deploy-token");
    if (xDeployToken) forwardedHeaders["X-Deploy-Token"] = xDeployToken;

    const xHubSig = req.headers.get("x-hub-signature-256");
    if (xHubSig) forwardedHeaders["X-Hub-Signature-256"] = xHubSig;

    const xGitlabToken = req.headers.get("x-gitlab-token");
    if (xGitlabToken) forwardedHeaders["X-Gitlab-Token"] = xGitlabToken;

    const bodyBuffer = await req.arrayBuffer();

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git/webhook${query}`, {
      method: "POST",
      headers: forwardedHeaders,
      body: bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "webhook deployment trigger failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
