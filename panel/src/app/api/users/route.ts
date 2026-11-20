import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all users / client sub-accounts. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/users", "GET");
  });
}

/** Create a new client sub-account with assigned domains and quotas. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return proxyAgent("/v1/users", "POST", body);
  });
}
