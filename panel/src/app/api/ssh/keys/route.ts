import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { resolveSshFingerprint, resolveSshKeyLine } from "@/app/api/ssh/shared";
import type { SshKey, SshKeysResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<SshKeysResponse>("/v1/ssh/keys"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const key = resolveSshKeyLine(body.key);

    const created = await agentFetch<{ key: SshKey }>("/v1/ssh/keys", {
      method: "POST",
      body: { key },
    });
    return json(created, 201);
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    // searchParams values are already percent-decoded.
    const fingerprint = resolveSshFingerprint(req.nextUrl.searchParams.get("fingerprint"));

    const remaining = await agentFetch<SshKeysResponse>(
      `/v1/ssh/keys?fingerprint=${encodeURIComponent(fingerprint)}`,
      { method: "DELETE" },
    );
    return json(remaining);
  });
}
