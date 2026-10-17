import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { DOMAIN_REGEX, HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { DNSZone, DNSZoneListResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<DNSZoneListResponse>("/v1/dns/zones"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const { name } = body;
    // docs/api.md section 1.4: zone names are lowercased before validation.
    const zone = typeof name === "string" ? name.trim().toLowerCase() : "";
    if (!DOMAIN_REGEX.test(zone)) {
      throw new HttpError(400, "invalid zone name", "invalid_zone");
    }

    const created = await agentFetch<{ zone: DNSZone }>("/v1/dns/zones", {
      method: "POST",
      body: { name: zone },
    });
    return json(created, 201);
  });
}
