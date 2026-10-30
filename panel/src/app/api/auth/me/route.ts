import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { config } from "@/lib/config";
import {
  HttpError,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";
import { SESSION_TTL_SECONDS } from "@/lib/session";
import {
  getUserProfile,
  setUserEmail,
  setUserPassword,
  validateEmail,
  validatePassword,
  verifyUser,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionInfo() {
  return {
    ttlDays: Math.round(SESSION_TTL_SECONDS / (24 * 60 * 60)),
    cookieSecure: config.cookieSecure,
  };
}

function accountResponse(username: string): NextResponse {
  const user = getUserProfile(username);
  if (!user) {
    throw new HttpError(401, "unauthorized");
  }
  return json({ user, session: sessionInfo() });
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = await requireAuth();
    return accountResponse(session.username);
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = await requireAuth();
    const body = await parseJsonBody(req);
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const hasPassword = Object.prototype.hasOwnProperty.call(body, "newPassword");

    if (!hasEmail && !hasPassword) {
      throw new HttpError(400, "nothing to update");
    }

    // Validate everything before writing so a rejected password cannot leave a
    // half-applied profile update behind.
    let email: string | null = null;
    if (hasEmail) {
      const raw = body.email;
      if (raw !== null && typeof raw !== "string") {
        throw new HttpError(400, "email must be a string", "invalid_email");
      }
      const trimmed = (raw ?? "").trim();
      if (trimmed) {
        const invalid = validateEmail(trimmed);
        if (invalid) throw new HttpError(400, invalid, "invalid_email");
      }
      email = trimmed || null;
    }

    if (hasPassword) {
      const currentPassword = body.currentPassword;
      const newPassword = body.newPassword;
      if (typeof newPassword !== "string") {
        throw new HttpError(400, "new password is required", "invalid_password");
      }
      if (typeof currentPassword !== "string" || currentPassword.length === 0) {
        throw new HttpError(400, "current password is required", "current_password_required");
      }
      const invalid = validatePassword(newPassword);
      if (invalid) throw new HttpError(400, invalid, "invalid_password");
      if (!(await verifyUser(session.username, currentPassword))) {
        throw new HttpError(400, "current password is incorrect", "invalid_current_password");
      }
      if (!setUserPassword(session.username, newPassword)) {
        throw new HttpError(401, "unauthorized");
      }
      try {
        await agentFetch<{ updated: boolean }>("/v1/ssh/password", {
          method: "POST",
          body: { user: "clouddeck", password: newPassword },
        });
      } catch {
        // Non-blocking sync
      }
    }

    if (hasEmail && !setUserEmail(session.username, email)) {
      throw new HttpError(401, "unauthorized");
    }

    return accountResponse(session.username);
  });
}
