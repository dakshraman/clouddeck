import { NextResponse } from "next/server";
import { config } from "@/lib/config";

const AGENT_TIMEOUT_MS = 15000;

/**
 * Forwards a request to the agent and passes its status and body through
 * unchanged. Shared by the v0.6 runtime, app, firewall and security routes.
 */
export async function proxyAgent(
  path: string,
  method: string,
  body?: unknown,
): Promise<NextResponse> {
  const hasBody = body !== undefined;
  let res: Response;
  try {
    res = await fetch(config.agentUrl + path, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
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
