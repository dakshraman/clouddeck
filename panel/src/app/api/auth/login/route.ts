import { NextResponse, type NextRequest } from "next/server";
import { HttpError, errorResponse, handleRoute, json, parseJsonBody } from "@/lib/http";
import { createSession } from "@/lib/session";
import { verifyTOTP } from "@/lib/totp";
import { getUser, hasTOTP, verifyUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await parseJsonBody(req);
    const { username, password, code } = body;
    if (typeof username !== "string" || typeof password !== "string") {
      throw new HttpError(400, "invalid request body");
    }

    if (!(await verifyUser(username, password))) {
      return errorResponse(401, "invalid credentials");
    }

    if (hasTOTP(username)) {
      if (typeof code !== "string" || !code.trim()) {
        return json({ requires2FA: true });
      }

      const user = getUser(username);
      if (!user?.totpSecret || !verifyTOTP(user.totpSecret, code.trim())) {
        return NextResponse.json(
          {
            error: "invalid_2fa_code",
            message: "Invalid two-factor authentication code",
          },
          { status: 401 },
        );
      }
    }

    await createSession({ username });
    return json({ user: { username } });
  });
}
