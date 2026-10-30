import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { PanelSSLInstallRequest, PanelSSLStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const result = await agentFetch<PanelSSLStatus>("/v1/panel/ssl");
    return json(result);
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(req);
    const payload: PanelSSLInstallRequest = {
      type: body.type as PanelSSLInstallRequest["type"],
      domain: typeof body.domain === "string" ? body.domain.trim() : undefined,
      email: typeof body.email === "string" ? body.email.trim() : undefined,
      cert: typeof body.cert === "string" ? body.cert : undefined,
      key: typeof body.key === "string" ? body.key : undefined,
    };
    const result = await agentFetch<PanelSSLStatus>("/v1/panel/ssl", {
      method: "POST",
      body: payload,
    });
    return json(result);
  });
}

export async function DELETE(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const result = await agentFetch<PanelSSLStatus>("/v1/panel/ssl", {
      method: "DELETE",
    });
    return json(result);
  });
}
