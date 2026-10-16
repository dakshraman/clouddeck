import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
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

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const { searchParams } = req.nextUrl;
    const path = searchParams.get("path") ?? "";
    if (!isValidPath(path)) {
      throw new HttpError(400, "invalid path", "invalid_path");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "invalid multipart body");
    }

    const outgoing = new FormData();
    let fileCount = 0;
    for (const value of form.getAll("file")) {
      if (value instanceof File) {
        outgoing.append("file", value, value.name);
        fileCount += 1;
      }
    }
    if (fileCount === 0) {
      throw new HttpError(400, "no files provided");
    }

    const query = new URLSearchParams({ path });
    const overwrite = searchParams.get("overwrite");
    if (overwrite !== null && overwrite !== "") {
      query.set("overwrite", overwrite);
    }

    let res: Response;
    try {
      res = await fetch(
        `${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/files/upload?${query}`,
        {
          method: "POST",
          body: outgoing,
          cache: "no-store",
          signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
        },
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
    return new NextResponse(await res.text(), { status: res.status, headers });
  });
}
