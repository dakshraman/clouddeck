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

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    // Same webroot-relative rules as every other file route; a destination is
    // always required.
    const from = resolvePath(body.from);
    const to = resolveNonEmptyPath(body.to, "invalid destination path");

    const { overwrite } = body;
    if (overwrite !== undefined && typeof overwrite !== "boolean") {
      throw new HttpError(400, "invalid overwrite flag", "invalid_path");
    }

    const payload: { from: string; to: string; overwrite?: boolean } = { from, to };
    if (overwrite === true) payload.overwrite = true;

    return forwardToAgent(filesAgentPath(domain, "/copy"), {
      method: "POST",
      body: payload,
    });
  });
}
