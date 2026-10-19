import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";
import { decodeFtpName, resolveFtpName, resolveFtpPassword } from "@/app/api/ftp/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 8000;

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { name: raw } = await ctx.params;
    const name = resolveFtpName(decodeFtpName(raw));

    const body = await parseJsonBody(req);
    const password = resolveFtpPassword(body.password);

    // The agent answers 204 with an empty body; errors pass through unchanged.
    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/ftp/accounts/${encodeURIComponent(name)}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const headers = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new NextResponse(await res.text(), { status: res.status, headers });
  });
}
