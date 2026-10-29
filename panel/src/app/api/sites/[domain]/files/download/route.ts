import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 120_000;

interface RouteContext {
  params: Promise<{ domain: string }>;
}

async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

/** docs/api.md section 1.1 path rules, mirrored so the panel rejects early. */
function isValidPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 1024) return false;
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) return false;
  if (path === "") return true;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const path = req.nextUrl.searchParams.get("path");
    if (!isValidPath(path)) {
      throw new HttpError(400, "invalid path", "invalid_path");
    }

    const query = new URLSearchParams({ path });

    let res: Response;
    try {
      res = await fetch(
        `${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/files/download?${query}`,
        { cache: "no-store", signal: AbortSignal.timeout(AGENT_TIMEOUT_MS) },
      );
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }

    const headers = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const disposition = res.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(res.body ?? null, { status: res.status, headers });
  });
}
