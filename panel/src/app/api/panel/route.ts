import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { handleRoute, json, requireAuth } from "@/lib/http";
import { SESSION_TTL_SECONDS } from "@/lib/session";
import { getPanelVersion } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json({
      version: getPanelVersion(),
      agentUrl: config.agentUrl,
      cookieSecure: config.cookieSecure,
      sessionTtlDays: Math.round(SESSION_TTL_SECONDS / (24 * 60 * 60)),
      nodeVersion: process.version,
    });
  });
}
