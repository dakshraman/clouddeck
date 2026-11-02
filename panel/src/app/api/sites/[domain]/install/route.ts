import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
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

const AGENT_TIMEOUT_MS = 60000;

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

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);
    const body = await parseJsonBody(req);
    const { template, dbName, dbUser, dbPass, dbHost } = body;

    if (typeof template !== "string" || !template.trim()) {
      throw new HttpError(400, "template is required", "missing_template");
    }

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/install-template`, {
        method: "POST",
        headers: agentHeaders("application/json"),
        body: JSON.stringify({ template, dbName, dbUser, dbPass, dbHost }),
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }

    const headers = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new NextResponse(await res.text(), { status: res.status, headers });
  });
}
