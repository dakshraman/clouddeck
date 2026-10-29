import { NextResponse, type NextRequest } from "next/server";
import { startUpdate } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a self-update; the panel restarts when the installer finishes. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const version = typeof body.version === "string" ? body.version.trim() : "";

    return json(await startUpdate(version), 202);
  });
}
