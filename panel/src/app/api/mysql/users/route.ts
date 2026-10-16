import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import type {
  MySQLCreateUserRequest,
  MySQLCreateUserResponse,
  MySQLListUsersResponse,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_REGEX = /^[A-Za-z0-9_]{1,32}$/;
const HOST_REGEX = /^[A-Za-z0-9_.%:-]{1,255}$/;
const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()_+=.,?-]{8,64}$/;
const DEFAULT_HOST = "localhost";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<MySQLListUsersResponse>("/v1/mysql/users"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const { user, password, host } = body;

    if (typeof user !== "string" || !USER_REGEX.test(user)) {
      throw new HttpError(400, "invalid user name", "invalid_user");
    }

    const resolvedHost = host === undefined || host === "" ? DEFAULT_HOST : host;
    if (typeof resolvedHost !== "string" || !HOST_REGEX.test(resolvedHost)) {
      throw new HttpError(400, "invalid host", "invalid_host");
    }

    const payload: MySQLCreateUserRequest = { user, host: resolvedHost };
    if (password !== undefined && password !== "") {
      if (typeof password !== "string" || !PASSWORD_REGEX.test(password)) {
        throw new HttpError(400, "invalid password", "weak_password");
      }
      payload.password = password;
    }

    // The agent returns 201 and includes the generated password once, when requested.
    const created = await agentFetch<MySQLCreateUserResponse>("/v1/mysql/users", {
      method: "POST",
      body: payload,
    });
    return json(created, 201);
  });
}
