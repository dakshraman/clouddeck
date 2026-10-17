import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import {
  optionalMailDomain,
  resolveMailEmail,
  resolveMailPassword,
  resolveMailQuota,
} from "@/app/api/mail/shared";
import type { MailAccount, MailAccountsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    // searchParams values are already percent-decoded.
    const domain = optionalMailDomain(req.nextUrl.searchParams.get("domain"));
    const path =
      domain === undefined
        ? "/v1/mail/accounts"
        : `/v1/mail/accounts?domain=${encodeURIComponent(domain)}`;
    return json(await agentFetch<MailAccountsResponse>(path));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const email = resolveMailEmail(typeof body.email === "string" ? body.email : "");
    const password = resolveMailPassword(body.password);
    const quotaMb = resolveMailQuota(body.quotaMb);

    const created = await agentFetch<MailAccount>("/v1/mail/accounts", {
      method: "POST",
      body: { email, password, quotaMb },
    });
    return json(created, 201);
  });
}
