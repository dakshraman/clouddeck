import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { resolveSshComment, resolveSshKeyName, resolveSshKeyType } from "@/app/api/ssh/shared";
import type { SshGeneratedKey, SshGeneratedKeysResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<SshGeneratedKeysResponse>("/v1/ssh/keys/generated"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const name = resolveSshKeyName(typeof body.name === "string" ? body.name : "");
    const type = resolveSshKeyType(body.type);
    const comment = resolveSshComment(body.comment);

    const created = await agentFetch<{ key: SshGeneratedKey }>("/v1/ssh/keys/generated", {
      method: "POST",
      body: { name, type, comment },
    });
    return json(created, 201);
  });
}
