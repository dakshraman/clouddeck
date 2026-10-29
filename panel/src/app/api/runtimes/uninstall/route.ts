import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import type { Task } from "@/lib/types";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a background runtime uninstall; returns the 202 task envelope. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const version = typeof body.version === "string" ? body.version.trim() : "";

    const result = await agentFetch<{ task: Task }>(
      `/v1/runtimes/${encodeURIComponent(kind)}/${encodeURIComponent(version)}`,
      { method: "DELETE" },
    );
    return json(result, 202);
  });
}
