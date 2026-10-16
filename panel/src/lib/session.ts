import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { isSetupComplete } from "@/lib/users";
import type { SessionUser } from "@/lib/types";

const COOKIE_NAME = "cd_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  u: string;
  exp: number;
}

function sign(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

function serialize(user: SessionUser): string {
  const payload: SessionPayload = {
    u: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function deserialize(token: string): SessionPayload | null {
  try {
    const separator = token.indexOf(".");
    if (separator <= 0) return null;

    const body = token.slice(0, separator);
    const received = Buffer.from(token.slice(separator + 1), "hex");
    const expected = Buffer.from(sign(body), "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<SessionPayload> | null;
    if (!payload || typeof payload.u !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { u: payload.u, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = deserialize(token);
    if (!payload) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  if (!isSetupComplete()) {
    redirect("/setup");
  }
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function createSession(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, serialize(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: config.cookieSecure,
    maxAge: 0,
  });
}
