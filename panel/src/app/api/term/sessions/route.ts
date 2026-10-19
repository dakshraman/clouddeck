import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { TERM_DEFAULT_COLS, TERM_DEFAULT_ROWS, resolveTermDimension } from "@/app/api/term/shared";
import type { TermSession } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    // docs/api.md section 1.9: cols/rows 8-500 each, defaults 80x24.
    const body = await parseJsonBody(req);
    const cols = resolveTermDimension(body.cols, TERM_DEFAULT_COLS);
    const rows = resolveTermDimension(body.rows, TERM_DEFAULT_ROWS);

    const created = await agentFetch<TermSession>("/v1/term/sessions", {
      method: "POST",
      body: { cols, rows },
    });
    return json(created, 201);
  });
}
