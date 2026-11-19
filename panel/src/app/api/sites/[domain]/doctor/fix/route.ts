import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { DOMAIN_REGEX, HttpError, decodeDomainParam, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ domain: string }>;
}

interface FixBody {
  fixType: string;
}

/** Applies an automated remediation action for a diagnosed site defect. */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const { domain: raw } = await ctx.params;
    const domain = decodeDomainParam(raw);
    if (!DOMAIN_REGEX.test(domain)) {
      throw new HttpError(400, "invalid domain name");
    }
    const body = await parseJsonBody(req);
    const fixType = typeof body.fixType === "string" ? body.fixType.trim() : "";
    if (!fixType) {
      throw new HttpError(400, "fixType is required");
    }
    return proxyAgent(`/v1/sites/${encodeURIComponent(domain)}/doctor/fix`, "POST", {
      fixType,
    });
  });
}
