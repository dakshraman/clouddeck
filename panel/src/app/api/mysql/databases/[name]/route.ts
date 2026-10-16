import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

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

    const deleted = await agentFetch<{ name: string; deleted: boolean }>(
      `/v1/mysql/databases/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
