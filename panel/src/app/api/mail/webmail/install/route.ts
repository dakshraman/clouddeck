import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Install Roundcube / SnappyMail webmail client. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    let body: Record<string, unknown> | undefined;
    try {
      body = await parseJsonBody(req);
    } catch {
      body = undefined;
    }
    return proxyAgent("/v1/mail/webmail/install", "POST", body ?? {});
  });
}
