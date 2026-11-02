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

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/app-installation`, {
        method: "GET",
        headers: agentHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(502, "clouddeck-agent is unreachable", "agent_unreachable");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let parsedMessage = "failed to get installed application info";
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        parsedMessage = parsed.message || parsed.error || parsedMessage;
      } catch {
        // ignore
      }
      throw new HttpError(res.status, parsedMessage);
    }

    const data = await res.json();
    return json(data);
  });
}

