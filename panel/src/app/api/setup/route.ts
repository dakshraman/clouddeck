import { NextResponse, type NextRequest } from "next/server";
import { HttpError, handleRoute, json, parseJsonBody } from "@/lib/http";
import { createSession } from "@/lib/session";
import {
  createUser,
  isSetupComplete,
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-run setup: creates the initial administrator account and signs it in.
 * Self-disabling — once any account exists this route answers 409 and the
 * only way to add accounts is from inside the panel.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    if (isSetupComplete()) {
      throw new HttpError(409, "setup already completed", "already_setup");
    }

    const body = await parseJsonBody(req);
    const { username, password, email } = body;
    if (typeof username !== "string" || typeof password !== "string") {
      throw new HttpError(400, "invalid request body");
    }

    const invalid =
      validateUsername(username) ??
      validatePassword(password) ??
      (typeof email === "string" && email.trim() !== "" ? validateEmail(email.trim()) : null);
    if (invalid) {
      throw new HttpError(400, invalid, "invalid_setup");
    }

    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    const user = createUser({
      username,
      password,
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
    });
    await createSession({ username: user.username });
    return json({ user: { username: user.username } }, 201);
  });
}
