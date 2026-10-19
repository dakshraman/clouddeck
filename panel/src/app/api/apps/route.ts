import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List every supervised app, optionally filtered by site. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const site = req.nextUrl.searchParams.get("site");
    const query = site ? `?site=${encodeURIComponent(site)}` : "";
    return proxyAgent(`/v1/apps${query}`, "GET");
  });
}

/** Create and start an app on an existing site. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    if (typeof body.site !== "string" || typeof body.command !== "string") {
      throw new HttpError(400, "site and command are required");
    }
    return proxyAgent("/v1/apps", "POST", body);
  });
}
