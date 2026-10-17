import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { resolveMailDomain } from "@/app/api/mail/shared";
import type { MailDomainsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<MailDomainsResponse>("/v1/mail/domains"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const domain = resolveMailDomain(typeof body.domain === "string" ? body.domain : "");

    const created = await agentFetch<{ domain: string }>("/v1/mail/domains", {
      method: "POST",
      body: { domain },
    });
    return json(created, 201);
  });
}
