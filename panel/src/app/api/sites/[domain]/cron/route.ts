import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
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

// Frozen by docs/api.md section 1.7: five space-separated fields, each
// matching ^[0-9*/,\-]{1,20}$; command 1–1024 chars, no newlines.
const CRON_FIELD_REGEX = /^[0-9*/,\-]{1,20}$/;
const CRON_COMMAND_MAX = 1024;

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

/** Mirrors the agent's cron schedule rule so the panel rejects early. */
function resolveCronSchedule(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid cron schedule", "invalid_cron");
  }
  const schedule = raw.trim();
  const fields = schedule.split(/\s+/);
  if (fields.length !== 5 || !fields.every((field) => CRON_FIELD_REGEX.test(field))) {
    throw new HttpError(
      400,
      'invalid cron schedule — five fields are required, for example "0 3 * * *"',
      "invalid_cron",
    );
  }
  return schedule;
}

/** Mirrors the agent's cron command rule so the panel rejects early. */
function resolveCronCommand(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length < 1 ||
    raw.length > CRON_COMMAND_MAX ||
    /[\r\n]/.test(raw)
  ) {
    throw new HttpError(
      400,
      `invalid cron command — 1 to ${CRON_COMMAND_MAX} characters, no newlines`,
      "invalid_cron",
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
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
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
    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/cron`, { method: "GET" });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const schedule = resolveCronSchedule(body.schedule);
    const command = resolveCronCommand(body.command);
    const { comment } = body;
    if (comment !== undefined && typeof comment !== "string") {
      throw new HttpError(400, "invalid cron comment", "invalid_cron");
    }

    const payload: { schedule: string; command: string; comment?: string } = {
      schedule,
      command,
    };
    if (typeof comment === "string") payload.comment = comment;

    return forwardToAgent(`/v1/sites/${encodeURIComponent(domain)}/cron`, {
      method: "POST",
      body: payload,
    });
  });
}
