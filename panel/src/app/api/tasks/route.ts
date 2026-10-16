import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await listTasks());
  });
}
