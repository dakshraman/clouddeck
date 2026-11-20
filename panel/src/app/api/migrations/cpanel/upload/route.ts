import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 600_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const contentType = req.headers.get("content-type") || "";

    // If multipart upload
    if (contentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new HttpError(400, "invalid multipart form body");
      }

      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        throw new HttpError(400, 'form field "file" is required');
      }

      const outgoing = new FormData();
      outgoing.append("file", file, file.name);

      try {
        const res = await fetch(`${config.agentUrl}/v1/migrations/cpanel/upload`, {
          method: "POST",
          headers: agentHeaders(),
          body: outgoing,
          cache: "no-store",
          signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
        });
        const headers = new Headers();
        const resType = res.headers.get("content-type");
        if (resType) headers.set("Content-Type", resType);
        return new NextResponse(await res.text(), { status: res.status, headers });
      } catch {
        return NextResponse.json(
          { error: { message: "CloudDeck agent is unreachable" } },
          { status: 502 },
        );
      }
    }

    // Otherwise JSON body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    try {
      const res = await fetch(`${config.agentUrl}/v1/migrations/cpanel/upload`, {
        method: "POST",
        headers: agentHeaders("application/json"),
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
      const headers = new Headers();
      const resType = res.headers.get("content-type");
      if (resType) headers.set("Content-Type", resType);
      return new NextResponse(await res.text(), { status: res.status, headers });
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }
  });
}
