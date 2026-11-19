import { NextResponse, type NextRequest } from "next/server";
import { proxyAgent } from "@/lib/agent-proxy";
import { HttpError, handleRoute, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FixBody {
  fixType: string;
}

/** Applies an automated remediation action for a diagnosed system issue. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    const fixType = typeof body.fixType === "string" ? body.fixType.trim() : "";
    if (!fixType) {
      throw new HttpError(400, "fixType is required");
    }
    return proxyAgent("/v1/system/doctor/fix", "POST", {
      fixType,
    });
  });
}
