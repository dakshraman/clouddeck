import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 300_000;
const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;

interface RouteContext {
  params: Promise<{ name: string }>;
}

async function resolveName(ctx: RouteContext): Promise<string> {
  const { name: raw } = await ctx.params;
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the regex check below rejects it.
  }
  if (!DATABASE_NAME_REGEX.test(name)) {
    throw new HttpError(400, "invalid database name", "invalid_name");
  }
  return name;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const name = await resolveName(ctx);

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/mysql/databases/${encodeURIComponent(name)}/export`, {
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

    if (!res.ok) {
      const text = await res.text();
      let errorPayload: unknown = { error: { message: `Export failed with status ${res.status}` } };
      try {
        errorPayload = JSON.parse(text);
      } catch {
        // Fallback to text payload
      }
      return NextResponse.json(errorPayload, { status: res.status });
    }

    const headers = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const disposition = res.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(res.body ?? null, { status: res.status, headers });
  });
}
