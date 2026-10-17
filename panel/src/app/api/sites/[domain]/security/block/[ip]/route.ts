import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 8000;

interface RouteContext {
  params: Promise<{ domain: string; ip: string }>;
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
function resolveIP(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the isIP check below rejects it.
  }
  if (isIP(decoded) === 0) {
    throw new HttpError(400, "invalid IP address", "invalid_ip");
  }
  return decoded;
}

/** Forwards the request and passes the agent's status + body through unchanged. */
async function forwardToAgent(agentPath: string, method: string): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(config.agentUrl + agentPath, {
      method,
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

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const { ip: rawIp } = await ctx.params;
    const ip = resolveIP(rawIp);

    return forwardToAgent(
      `/v1/sites/${encodeURIComponent(domain)}/security/block/${encodeURIComponent(ip)}`,
      "DELETE",
    );
  });
}
