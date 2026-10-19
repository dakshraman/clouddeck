import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";
import {
  type RouteContext,
  filesAgentPath,
  forwardToAgent,
  resolveDomain,
  resolveNonEmptyPath,
  resolvePath,
} from "@/app/api/sites/[domain]/files/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PATHS = 256;

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const { paths, format } = body;
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) {
      throw new HttpError(400, "invalid paths — at least one path is required", "invalid_path");
    }
    const resolvedPaths = paths.map((entry) => resolvePath(entry));
    if (format !== "tar.gz" && format !== "zip") {
      throw new HttpError(400, 'invalid format — use "tar.gz" or "zip"', "invalid_format");
    }
    const target = resolveNonEmptyPath(body.target, "invalid target path");

    return forwardToAgent(filesAgentPath(domain, "/compress"), {
      method: "POST",
      body: { paths: resolvedPaths, format, target },
    });
  });
}
