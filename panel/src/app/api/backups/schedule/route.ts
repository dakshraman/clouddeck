import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { BackupSchedule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<BackupSchedule>("/v1/backups/schedule"));
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    // The agent owns the field rules (docs/api.md section 1.8) and answers
    // 400 invalid_schedule / 409 dry_run with a clear message, which passes
    // through unchanged.
    const body = await parseJsonBody(req);
    const schedule = await agentFetch<BackupSchedule>("/v1/backups/schedule", {
      method: "PUT",
      body,
    });
    return json(schedule);
  });
}
