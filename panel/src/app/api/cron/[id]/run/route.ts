import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await params;
    return proxyAgent(`/v1/cron/${encodeURIComponent(id)}/run`, "POST");
  });
}
