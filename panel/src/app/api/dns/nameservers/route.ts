import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import { handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 8000;

async function forwardToAgent(
  agentPath: string,
  init: { method: string; body?: unknown },
): Promise<NextResponse> {
  const hasBody = init.body !== undefined;

  let res: Response;
  try {
    res = await fetch(config.agentUrl + agentPath, {
      method: init.method,
      headers: agentHeaders(hasBody ? "application/json" : undefined),
      body: hasBody ? JSON.stringify(init.body) : undefined,
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
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return forwardToAgent("/v1/dns/nameservers", { method: "GET" });
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    return forwardToAgent("/v1/dns/nameservers", { method: "PUT", body });
  });
}
