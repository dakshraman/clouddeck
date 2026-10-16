import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_REGEX = /^[A-Za-z0-9_]{1,32}$/;
const HOST_REGEX = /^[A-Za-z0-9_.%:-]{1,255}$/;
const DEFAULT_HOST = "localhost";

interface RouteContext {
  params: Promise<{ user: string }>;
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { user: raw } = await ctx.params;
    let user = raw;
    try {
      user = decodeURIComponent(raw);
    } catch {
      // Malformed escape sequence; the regex check below rejects it.
    }
    if (!USER_REGEX.test(user)) {
      throw new HttpError(400, "invalid user name", "invalid_user");
    }

    // searchParams values are already percent-decoded.
    const hostParam = req.nextUrl.searchParams.get("host");
    const host = hostParam === null || hostParam === "" ? DEFAULT_HOST : hostParam;
    if (!HOST_REGEX.test(host)) {
      throw new HttpError(400, "invalid host", "invalid_host");
    }

    const deleted = await agentFetch<{ user: string; host: string; deleted: boolean }>(
      `/v1/mysql/users/${encodeURIComponent(user)}?host=${encodeURIComponent(host)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
