import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Get anti-spam score thresholds and greylisting config. */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/mail/spam/config", "GET");
  });
}

/** Update anti-spam score thresholds, reject action, and greylisting. */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return proxyAgent("/v1/mail/spam/config", "PUT", body);
  });
}

/** Allow POST as an alias for updating config. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return PUT(req);
}
