import { NextResponse, type NextRequest } from "next/server";
import { handleRoute } from "@/lib/http";
import { proxyPreview } from "@/app/api/preview/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string; path: string[] }>;
}

async function handle(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { domain, path } = await ctx.params;
    const subpath = Array.isArray(path) ? path.join("/") : "";
    return proxyPreview(req, domain, subpath);
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const HEAD = handle;
export const OPTIONS = handle;
