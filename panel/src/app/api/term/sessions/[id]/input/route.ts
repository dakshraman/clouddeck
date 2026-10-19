import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";
import { agentPassThrough, resolveTermSessionId } from "@/app/api/term/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keystrokes and bracketed pastes; ~1 MiB of base64 is far beyond a paste
// chunk and keeps the proxy from buffering absurd bodies.
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const INPUT_MAX_CHARS = 1048576;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { id } = await ctx.params;
    const sessionId = resolveTermSessionId(id);

    const body = await parseJsonBody(req);
    const data = body.data;
    if (
      typeof data !== "string" ||
      data.length === 0 ||
      data.length > INPUT_MAX_CHARS ||
      data.length % 4 !== 0 ||
      !BASE64_REGEX.test(data)
    ) {
      throw new HttpError(400, "data must be base64", "invalid_input");
    }

    return agentPassThrough(`/v1/term/sessions/${encodeURIComponent(sessionId)}/input`, {
      method: "POST",
      body: { data },
    });
  });
}
