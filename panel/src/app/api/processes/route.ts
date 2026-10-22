import { type NextRequest, NextResponse } from "next/server";
import { getProcesses } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const sort = request.nextUrl.searchParams.get("sort") === "mem" ? "mem" : "cpu";
    return json(await getProcesses(sort));
  });
}
