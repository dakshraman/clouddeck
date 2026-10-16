import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type { MySQLGrantRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_REGEX = /^[A-Za-z0-9_]{1,32}$/;
const HOST_REGEX = /^[A-Za-z0-9_.%:-]{1,255}$/;
const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;
const DEFAULT_HOST = "localhost";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const { user, host, database, privileges } = body;

    if (typeof user !== "string" || !USER_REGEX.test(user)) {
      throw new HttpError(400, "invalid user name", "invalid_user");
    }

    const resolvedHost = host === undefined || host === "" ? DEFAULT_HOST : host;
    if (typeof resolvedHost !== "string" || !HOST_REGEX.test(resolvedHost)) {
      throw new HttpError(400, "invalid host", "invalid_host");
    }

    if (typeof database !== "string" || !DATABASE_NAME_REGEX.test(database)) {
      throw new HttpError(400, "invalid database name", "invalid_name");
    }

    if (privileges !== "all") {
      throw new HttpError(400, "invalid privileges; only all is supported", "privileges");
    }

    const payload: MySQLGrantRequest = {
      user,
      host: resolvedHost,
      database,
      privileges: "all",
    };
    const granted = await agentFetch<{ granted: boolean }>("/v1/mysql/grants", {
      method: "POST",
      body: payload,
    });
    return json(granted);
  });
}
