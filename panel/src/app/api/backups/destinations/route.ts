import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List configured cloud backup storage destinations (S3, R2, B2, Wasabi, MinIO). */
export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return proxyAgent("/v1/backups/destinations", "GET");
  });
}

/** Add a new cloud backup storage destination. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return proxyAgent("/v1/backups/destinations", "POST", body);
  });
}
