import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 8000;

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

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const { path } = body;
    if (!isValidPath(path)) {
      throw new HttpError(400, "invalid path", "invalid_path");
    }

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/files/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }

    const headers = new Headers();
    const contentType = res.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new NextResponse(await res.text(), { status: res.status, headers });
  });
}
