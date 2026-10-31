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

// Frozen by docs/api.md section 1.7: one DNS label, never "www".
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

interface RouteContext {
  params: Promise<{ domain: string; name: string }>;
}

async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

/** Mirrors the agent's subdomain name rule so the panel rejects early. */
function resolveSubdomainName(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the regex check below rejects it.
  }
  const name = decoded.trim().toLowerCase();
  if (name === "www") {
    throw new HttpError(400, '"www" is reserved for the main site', "invalid_subdomain");
  }
  if (!SUBDOMAIN_REGEX.test(name)) {
    throw new HttpError(
      400,
      'invalid subdomain name — use lowercase letters, digits and hyphens (for example "blog")',
      "invalid_subdomain",
    );
  }
  return name;
}

/** Forwards the request and passes the agent's status + body through unchanged. */
async function forwardToAgent(agentPath: string, method: string): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(config.agentUrl + agentPath, {
      method,
      headers: agentHeaders(),
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

    const { name: rawName } = await ctx.params;
    const name = resolveSubdomainName(rawName);

    return forwardToAgent(
      `/v1/sites/${encodeURIComponent(domain)}/subdomains/${encodeURIComponent(name)}`,
      "DELETE",
    );
  });
}
