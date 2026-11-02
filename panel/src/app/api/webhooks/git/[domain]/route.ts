import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { DOMAIN_REGEX, decodeDomainParam } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      return NextResponse.json({ error: "invalid domain name" }, { status: 400 });
    }

    const bodyBuffer = await req.arrayBuffer();

    // Pass through relevant GitHub and GitLab webhook headers
    const forwardedHeaders: Record<string, string> = {
      "Content-Type": req.headers.get("content-type") || "application/json",
    };
    const xHubSig = req.headers.get("x-hub-signature-256");
    if (xHubSig) forwardedHeaders["X-Hub-Signature-256"] = xHubSig;

    const xGhEvent = req.headers.get("x-github-event");
    if (xGhEvent) forwardedHeaders["X-GitHub-Event"] = xGhEvent;

    const xGitlabToken = req.headers.get("x-gitlab-token");
    if (xGitlabToken) forwardedHeaders["X-Gitlab-Token"] = xGitlabToken;

    const xGitlabEvent = req.headers.get("x-gitlab-event");
    if (xGitlabEvent) forwardedHeaders["X-Gitlab-Event"] = xGitlabEvent;

    const res = await fetch(`${config.agentUrl}/v1/sites/${encodeURIComponent(domain)}/git/webhook`, {
      method: "POST",
      headers: forwardedHeaders,
      body: bodyBuffer,
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "webhook forwarding failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
