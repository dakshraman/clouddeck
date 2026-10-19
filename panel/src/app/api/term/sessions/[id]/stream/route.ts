import { type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { HttpError, errorResponse, requireAuth } from "@/lib/http";
import { resolveTermSessionId } from "@/app/api/term/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * SSE passthrough: this route does not JSON-proxy, it streams the agent's
 * body through unchanged so `event: out` chunks reach the browser as they
 * arrive. `req.signal` aborts the upstream request when the client drops.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  try {
    await requireAuth();

    const { id } = await ctx.params;
    const sessionId = resolveTermSessionId(id);

    let upstream: Response;
    try {
      upstream = await fetch(
        `${config.agentUrl}/v1/term/sessions/${encodeURIComponent(sessionId)}/stream`,
        { cache: "no-store", signal: req.signal },
      );
    } catch {
      return errorResponse(502, "CloudDeck agent is unreachable");
    }

    if (!upstream.ok || !upstream.body) {
      let message = `CloudDeck agent request failed with status ${upstream.status}`;
      let code: string | undefined;
      try {
        const payload = (await upstream.json()) as { error?: { message?: unknown; code?: unknown } };
        if (typeof payload.error?.message === "string" && payload.error.message.length > 0) {
          message = payload.error.message;
        }
        if (typeof payload.error?.code === "string" && payload.error.code.length > 0) {
          code = payload.error.code;
        }
      } catch {
        // Non-JSON error body; the status decides how it is reported.
      }
      return errorResponse(upstream.status, message, code);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.status, err.message, err.code);
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    return errorResponse(500, "internal error");
  }
}
