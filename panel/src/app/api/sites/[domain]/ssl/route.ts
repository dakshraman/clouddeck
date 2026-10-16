import { NextResponse, type NextRequest } from "next/server";
import { issueSsl } from "@/lib/agent";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RouteContext {
  params: Promise<{ domain: string }>;
}

async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const domain = await resolveDomain(ctx);

    const body = await parseJsonBody(req);
    const { email } = body;
    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      throw new HttpError(400, "invalid email");
    }

    const { taskId } = await issueSsl(domain, { email });
    return json({ taskId }, 202);
  });
}
