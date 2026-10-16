import { NextResponse, type NextRequest } from "next/server";
import { getTask } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { id } = await ctx.params;
    return json(await getTask(id));
  });
}
