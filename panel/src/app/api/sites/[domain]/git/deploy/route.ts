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

const AGENT_DEPLOY_TIMEOUT_MS = 600000; // 10 minutes for build/clones

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

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git/deploy`, {
      method: "POST",
      headers: agentHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_DEPLOY_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new HttpError(res.status, errData.message || "deployment failed");
    }
    return json(await res.json());
  });
}

