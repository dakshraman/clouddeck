import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";
import {
  type RouteContext,
  filesAgentPath,
  forwardToAgent,
  resolveDomain,
  resolvePath,
} from "@/app/api/sites/[domain]/files/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Octal mode, three or four digits: "644" or "0755" (docs/api.md section 1.9). */
const MODE_REGEX = /^0?[0-7]{3}$/;

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const path = resolvePath(body.path);
    const rawMode = body.mode;
    const mode =
      typeof rawMode === "string"
        ? rawMode.trim()
        : typeof rawMode === "number"
          ? String(rawMode)
          : "";
    if (!MODE_REGEX.test(mode)) {
      throw new HttpError(
        400,
        'invalid mode — use an octal mode like "644" or "0755"',
        "invalid_mode",
      );
    }

    return forwardToAgent(filesAgentPath(domain, "/chmod"), {
      method: "POST",
      body: { path, mode },
    });
  });
}
