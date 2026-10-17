import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const id = await resolveId(ctx);
    const { taskId } = await agentFetch<{ taskId: string }>(
      `/v1/backups/${encodeURIComponent(id)}/restore`,
      { method: "POST" },
    );
    return json({ taskId }, 202);
  });
}
