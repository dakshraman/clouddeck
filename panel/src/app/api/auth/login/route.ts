import { NextResponse, type NextRequest } from "next/server";
import { HttpError, errorResponse, handleRoute, json, parseJsonBody } from "@/lib/http";
import { createSession } from "@/lib/session";
import { verifyUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await parseJsonBody(req);
    const { username, password } = body;
    if (typeof username !== "string" || typeof password !== "string") {
      throw new HttpError(400, "invalid request body");
    }

    if (!(await verifyUser(username, password))) {
      return errorResponse(401, "invalid credentials");
    }

    await createSession({ username });
    return json({ user: { username } });
  });
}
