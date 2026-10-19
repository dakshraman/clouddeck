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

/** docs/api.md section 1.9: only .tar.gz, .tgz and .zip archives are supported. */
const ARCHIVE_REGEX = /\.(tar\.gz|tgz|zip)$/i;

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const archive = resolvePath(body.archive);
    if (!ARCHIVE_REGEX.test(archive)) {
      throw new HttpError(
        400,
        "invalid archive — .tar.gz, .tgz or .zip is required",
        "invalid_archive",
      );
    }
    // An empty destination extracts into the site root.
    const dest = resolvePath(body.dest, "invalid destination path");

    return forwardToAgent(filesAgentPath(domain, "/extract"), {
      method: "POST",
      body: { archive, dest },
    });
  });
}
