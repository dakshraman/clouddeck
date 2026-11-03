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

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",
    bmp: "image/bmp",
    avif: "image/avif",
    // Documents
    pdf: "application/pdf",
    // Media
    mp4: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    // Text / Code
    txt: "text/plain; charset=utf-8",
    log: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    ts: "text/plain; charset=utf-8",
    tsx: "text/plain; charset=utf-8",
    jsx: "text/plain; charset=utf-8",
    json: "application/json; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    php: "text/plain; charset=utf-8",
    py: "text/plain; charset=utf-8",
    sh: "text/plain; charset=utf-8",
    sql: "text/plain; charset=utf-8",
    env: "text/plain; charset=utf-8",
    yaml: "text/yaml; charset=utf-8",
    yml: "text/yaml; charset=utf-8",
    ini: "text/plain; charset=utf-8",
    conf: "text/plain; charset=utf-8",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const domain = await resolveDomain(ctx);

    const path = req.nextUrl.searchParams.get("path");
    if (!isValidPath(path)) {
      throw new HttpError(400, "invalid path", "invalid_path");
    }

    const inline = req.nextUrl.searchParams.get("inline") === "true";
    const query = new URLSearchParams({ path });

    let res: Response;
    try {
      res = await fetch(
        `${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/files/download?${query}`,
        {
          headers: agentHeaders(),
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
    const filename = path.split("/").pop() || "download";

    if (inline) {
      headers.set("Content-Disposition", `inline; filename="${filename}"`);
      headers.set("Content-Type", getMimeType(filename));
      headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
    } else {
      const contentType = res.headers.get("content-type");
      if (contentType) headers.set("Content-Type", contentType);
      const disposition = res.headers.get("content-disposition");
      if (disposition) headers.set("Content-Disposition", disposition);
    }

    return new NextResponse(res.body ?? null, { status: res.status, headers });
  });
}
