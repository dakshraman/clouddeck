import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import {
  optionalMailDomain,
  resolveMailEmail,
  resolveMailTargets,
} from "@/app/api/mail/shared";
import type { MailForwardersResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    // searchParams values are already percent-decoded.
    const domain = optionalMailDomain(req.nextUrl.searchParams.get("domain"));
    const path =
      domain === undefined
        ? "/v1/mail/forwarders"
        : `/v1/mail/forwarders?domain=${encodeURIComponent(domain)}`;
    return json(await agentFetch<MailForwardersResponse>(path));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const source = resolveMailEmail(typeof body.source === "string" ? body.source : "");
    const target = resolveMailTargets(body.target);

    const created = await agentFetch<{ source: string; target: string }>(
      "/v1/mail/forwarders",
      { method: "POST", body: { source, target } },
    );
    return json(created, 201);
  });
}
