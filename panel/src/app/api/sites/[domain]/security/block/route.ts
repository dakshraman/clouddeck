import { isIP } from "node:net";
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

const AGENT_TIMEOUT_MS = 8000;

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

/** Mirrors the agent's net.ParseIP check so the panel rejects early. */
function resolveIP(raw: unknown): string {
  if (typeof raw !== "string" || isIP(raw) === 0) {
    throw new HttpError(400, "invalid IP address", "invalid_ip");
  }
  return raw;
}

/** Forwards the request and passes the agent's status + body through unchanged. */
async function forwardToAgent(
  agentPath: string,
  init: { method: string; body?: unknown },
): Promise<NextResponse> {
  const hasBody = init.body !== undefined;

  let res: Response;
  try {
    res = await fetch(config.agentUrl + agentPath, {
      method: init.method,
      headers: agentHeaders(hasBody ? "application/json" : undefined),
      body: hasBody ? JSON.stringify(init.body) : undefined,
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
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const ip = resolveIP(body.ip);
    const { note } = body;
    if (note !== undefined && typeof note !== "string") {
      throw new HttpError(400, "invalid note", "invalid_ip");
    }

    const payload: { ip: string; note?: string } = { ip };
    if (typeof note === "string") payload.note = note;

    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/security/block`, {
      method: "POST",
      body: payload,
    });
  });
}
