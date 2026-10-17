import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, requireAuth } from "@/lib/http";
import type { MailStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<MailStatus>("/v1/mail/status"));
  });
}
