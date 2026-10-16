import { NextResponse, type NextRequest } from "next/server";
import { createSite, listSites } from "@/lib/agent";
import {
  DOMAIN_REGEX,
  HttpError,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHP_VERSION_REGEX = /^(none|\d+\.\d+)$/;

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await listSites());
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const { domain, phpVersion } = body;
    if (typeof domain !== "string" || typeof phpVersion !== "string") {
      throw new HttpError(400, "invalid request body");
    }

    const normalizedDomain = domain.toLowerCase();
    if (!DOMAIN_REGEX.test(normalizedDomain)) {
      throw new HttpError(400, "invalid domain name");
    }
    if (!PHP_VERSION_REGEX.test(phpVersion)) {
      throw new HttpError(400, "invalid PHP version");
    }

    const { taskId } = await createSite({ domain: normalizedDomain, phpVersion });
    return json({ taskId }, 202);
  });
}
