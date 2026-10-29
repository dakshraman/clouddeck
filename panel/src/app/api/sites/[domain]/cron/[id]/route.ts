import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
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

// Frozen by docs/api.md section 1.7: 8 lowercase hex characters.
const CRON_ID_REGEX = /^[0-9a-f]{8}$/;

interface RouteContext {
  params: Promise<{ domain: string; id: string }>;
}

async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

function resolveCronId(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the regex check below rejects it.
  }
  const id = decoded.trim().toLowerCase();
  if (!CRON_ID_REGEX.test(id)) {
    throw new HttpError(400, "invalid cron job id", "invalid_cron");
  }
  return id;
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

    const { id: rawId } = await ctx.params;
    const id = resolveCronId(rawId);

    return forwardToAgent(
      `/v1/sites/${encodeURIComponent(domain)}/cron/${encodeURIComponent(id)}`,
      "DELETE",
    );
  });
}
