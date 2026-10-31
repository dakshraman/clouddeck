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

// Frozen by docs/api.md section 1.7: days is 1–90, default 7.
const MIN_DAYS = 1;
const MAX_DAYS = 90;

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

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const query = new URLSearchParams();
    const rawDays = req.nextUrl.searchParams.get("days");
    if (rawDays !== null && rawDays !== "") {
      if (!/^\d+$/.test(rawDays)) {
        throw new HttpError(400, `days must be an integer between ${MIN_DAYS} and ${MAX_DAYS}`, "invalid_days");
      }
      const days = Number(rawDays);
      if (days < MIN_DAYS || days > MAX_DAYS) {
        throw new HttpError(400, `days must be an integer between ${MIN_DAYS} and ${MAX_DAYS}`, "invalid_days");
      }
      query.set("days", String(days));
    }
    const suffix = query.toString() === "" ? "" : `?${query.toString()}`;

    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/stats${suffix}`, "GET");
  });
}
