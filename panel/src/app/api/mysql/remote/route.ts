import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { RemoteMysqlUsersResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the agent's remote host rules (docs/api.md section 1.9): the user is
// an existing MySQL account name; the host is an IP, a hostname or %.
const USER_REGEX = /^[A-Za-z0-9_]{1,32}$/;
const HOST_REGEX = /^[A-Za-z0-9_.%:-]{1,255}$/;

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<RemoteMysqlUsersResponse>("/v1/mysql/remote"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);

    const user = typeof body.user === "string" ? body.user.trim() : "";
    if (!USER_REGEX.test(user)) {
      throw new HttpError(400, "invalid user name", "invalid_user");
    }

    const host = typeof body.host === "string" ? body.host.trim() : "";
    if (host === "" || !HOST_REGEX.test(host)) {
      throw new HttpError(400, "invalid host - use an IP address, a hostname or %", "invalid_host");
    }
    if (host.toLowerCase() === "localhost") {
      throw new HttpError(400, "host must not be localhost", "invalid_host_local");
    }

    const created = await agentFetch<{ user: string; host?: string }>("/v1/mysql/remote", {
      method: "POST",
      body: { user, host },
    });
    return json(created, 201);
  });
}
