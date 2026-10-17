import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, decodeDomainParam, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { resolveMailDomain } from "@/app/api/mail/shared";
import type { MailDNSOptions, MailDNSResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Frozen by docs/api.md section 1.6.
const DMARC_POLICIES: readonly string[] = ["none", "quarantine", "reject", ""];

interface RouteContext {
  params: Promise<{ domain: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const { domain: raw } = await ctx.params;
    const domain = resolveMailDomain(decodeDomainParam(raw));

    const body = await parseJsonBody(req);
    const options: MailDNSOptions = {};

    for (const key of ["spf", "dkim", "mx"] as const) {
      const value = body[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== "boolean") {
        throw new HttpError(400, `invalid ${key} option`, "invalid_request");
      }
      options[key] = value;
    }

    const policy = body.dmarcPolicy;
    if (policy !== undefined && policy !== null) {
      if (typeof policy !== "string" || !DMARC_POLICIES.includes(policy)) {
        throw new HttpError(400, "invalid dmarcPolicy", "invalid_request");
      }
      options.dmarcPolicy = policy as MailDNSOptions["dmarcPolicy"];
    }

    const result = await agentFetch<MailDNSResult>(`/v1/mail/dns/${encodeURIComponent(domain)}`, {
      method: "POST",
      body: options,
    });
    return json(result);
  });
}
