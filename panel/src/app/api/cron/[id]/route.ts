import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await params;
    return proxyAgent(`/v1/cron/${encodeURIComponent(id)}`, "GET");
  });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await params;
    const body = await parseJsonBody(req);
    return proxyAgent(`/v1/cron/${encodeURIComponent(id)}`, "PUT", body);
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await params;
    return proxyAgent(`/v1/cron/${encodeURIComponent(id)}`, "DELETE");
  });
}
