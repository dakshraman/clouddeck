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

// Frozen by docs/api.md section 1.7.
const REDIRECT_FROM_MAX = 512;
const REDIRECT_TO_MAX = 2048;
const REDIRECT_FROM_FORBIDDEN = /[\s"';{}]/;
const REDIRECT_TO_REGEX = /^https?:\/\/\S+$/;

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

/** Mirrors the agent's redirect "from" rule so the panel rejects early. */
function resolveRedirectFrom(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length < 1 ||
    raw.length > REDIRECT_FROM_MAX ||
    !raw.startsWith("/") ||
    REDIRECT_FROM_FORBIDDEN.test(raw)
  ) {
    throw new HttpError(
      400,
      'invalid redirect source — it must start with "/" and contain no spaces, quotes, ";" or braces',
      "invalid_redirect",
    );
  }
  return raw;
}

/** Mirrors the agent's redirect "to" rule so the panel rejects early. */
function resolveRedirectTo(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length < 1 ||
    raw.length > REDIRECT_TO_MAX ||
    !REDIRECT_TO_REGEX.test(raw)
  ) {
    throw new HttpError(
      400,
      "invalid redirect target — use an absolute http:// or https:// URL",
      "invalid_redirect",
    );
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

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);
    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/redirects`, {
      method: "GET",
    });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const from = resolveRedirectFrom(body.from);
    const to = resolveRedirectTo(body.to);
    const { permanent } = body;
    if (permanent !== undefined && typeof permanent !== "boolean") {
      throw new HttpError(400, "invalid redirect type", "invalid_redirect");
    }

    const payload: { from: string; to: string; permanent?: boolean } = { from, to };
    if (typeof permanent === "boolean") payload.permanent = permanent;

    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/redirects`, {
      method: "POST",
      body: payload,
    });
  });
}
