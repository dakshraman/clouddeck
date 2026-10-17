import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 120_000;

/** docs/api.md section 1.5 backup id rules, mirrored so the panel rejects early. */
const BACKUP_ID_REGEX = /^[a-z0-9][a-z0-9._-]{0,199}$/;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function resolveId(ctx: RouteContext): Promise<string> {
  const { id: raw } = await ctx.params;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the regex check below rejects it.
  }
  if (!BACKUP_ID_REGEX.test(id)) {
    throw new HttpError(400, "invalid backup id", "invalid_id");
  }
  return id;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const id = await resolveId(ctx);

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/backups/${encodeURIComponent(id)}/download`, {
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
    const disposition = res.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(res.body ?? null, { status: res.status, headers });
  });
}
