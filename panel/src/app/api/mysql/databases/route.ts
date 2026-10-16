import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { MySQLListDatabasesResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<MySQLListDatabasesResponse>("/v1/mysql/databases"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const { name } = body;
    if (typeof name !== "string" || !DATABASE_NAME_REGEX.test(name)) {
      throw new HttpError(400, "invalid database name", "invalid_name");
    }

    const created = await agentFetch<{ name: string }>("/v1/mysql/databases", {
      method: "POST",
      body: { name },
    });
    return json(created, 201);
  });
}
