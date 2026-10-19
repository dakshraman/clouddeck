import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the agent's remote host rules (docs/api.md section 1.9).
const USER_REGEX = /^[A-Za-z0-9_]{1,32}$/;
const HOST_REGEX = /^[A-Za-z0-9_.%:-]{1,255}$/;

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
    const host = req.nextUrl.searchParams.get("host")?.trim() ?? "";
    if (host === "" || !HOST_REGEX.test(host)) {
      throw new HttpError(
        400,
        "invalid host - the host query parameter is required",
        "invalid_host",
      );
    }
    if (host.toLowerCase() === "localhost") {
      throw new HttpError(400, "host must not be localhost", "invalid_host_local");
    }

    const deleted = await agentFetch<{ user: string; host?: string }>(
      `/v1/mysql/remote/${encodeURIComponent(user)}?host=${encodeURIComponent(host)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
