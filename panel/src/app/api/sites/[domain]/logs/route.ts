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

// Frozen by docs/api.md section 1.7: kind is access|error (default access);
// lines is 1–2000 (default 200).
const LOG_KINDS = ["access", "error"] as const;
const MIN_LINES = 1;
const MAX_LINES = 2000;
const DEFAULT_LINES = 200;

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

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const kind = req.nextUrl.searchParams.get("kind") ?? "access";
    if (!(LOG_KINDS as readonly string[]).includes(kind)) {
      throw new HttpError(400, 'kind must be "access" or "error"', "invalid_kind");
    }

    let lines = DEFAULT_LINES;
    const rawLines = req.nextUrl.searchParams.get("lines");
    if (rawLines !== null && rawLines !== "") {
      if (!/^\d+$/.test(rawLines)) {
        throw new HttpError(400, `lines must be an integer between ${MIN_LINES} and ${MAX_LINES}`, "invalid_lines");
      }
      lines = Number(rawLines);
      if (lines < MIN_LINES || lines > MAX_LINES) {
        throw new HttpError(400, `lines must be an integer between ${MIN_LINES} and ${MAX_LINES}`, "invalid_lines");
      }
    }

    const query = new URLSearchParams({ kind, lines: String(lines) });
    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/logs?${query.toString()}`, "GET");
  });
}
