import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 300_000;
const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;

interface RouteContext {
  params: Promise<{ name: string }>;
}

async function resolveName(ctx: RouteContext): Promise<string> {
  const { name: raw } = await ctx.params;
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; the regex check below rejects it.
  }
  if (!DATABASE_NAME_REGEX.test(name)) {
    throw new HttpError(400, "invalid database name", "invalid_name");
  }
  return name;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const name = await resolveName(ctx);

    const incomingContentType = req.headers.get("content-type") ?? "";
    let body: BodyInit;
    let headers: Headers;

    if (incomingContentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(400, "invalid multipart body", "invalid_multipart");
      }

      const outgoing = new FormData();
      let fileCount = 0;
      for (const [, value] of form.entries()) {
        if (value instanceof File) {
          outgoing.append("file", value, value.name);
          fileCount++;
          break;
        }
      }
      if (fileCount === 0) {
        throw new HttpError(400, "no file provided", "no_file");
      }
      body = outgoing;
      headers = agentHeaders();
    } else {
      if (!req.body) {
        throw new HttpError(400, "request body is empty", "empty_body");
      }
      body = req.body;
      headers = agentHeaders(incomingContentType || "application/octet-stream");
    }

    const init: RequestInit & { duplex?: string } = {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      duplex: "half",
    };

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/mysql/databases/${encodeURIComponent(name)}/import`, init);
    } catch (err) {
      return NextResponse.json(
        { error: { message: `CloudDeck agent is unreachable: ${err instanceof Error ? err.message : String(err)}` } },
        { status: 502 },
      );
    }

    const text = await res.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: { message: text || `Agent responded with ${res.status}` } };
    }

    return NextResponse.json(payload, { status: res.status });
  });
}
