import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get php.ini directives for a given or default PHP version. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const version = req.nextUrl.searchParams.get("version");
    const query = version ? `?version=${encodeURIComponent(version)}` : "";
    return proxyAgent(`/v1/runtimes/php/config${query}`, "GET");
  });
}

/** Update php.ini directives for a PHP version and reload PHP-FPM. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return proxyAgent("/v1/runtimes/php/config", "POST", body);
  });
}
