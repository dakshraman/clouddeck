import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List PostgreSQL databases with sizes and owners. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/postgres/databases", "GET");
  });
}

/** Create a new PostgreSQL database. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return proxyAgent("/v1/postgres/databases", "POST", body);
  });
}
