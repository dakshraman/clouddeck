import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, requireAuth } from "@/lib/http";
import type { PmaLoginCookie, PmaLoginResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const raw = (forwarded || request.headers.get("host") || request.nextUrl.hostname).trim();
  try {
    const hostname = new URL(`http://${raw}`).hostname;
    return hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
  } catch {
    return request.nextUrl.hostname;
  }
}

// phpMyAdmin already percent-encodes its cookie values. Using Next's cookie
// serializer here would encode them a second time and break authentication.
function rawSetCookie(cookie: PmaLoginCookie, path: string): string {
  const name = cookie.name.replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, "");
  const value = cookie.value.replace(/[\r\n;]/g, "");
  const parts = [`${name}=${value}`, `Path=${path}`];
  if (cookie.maxAge && cookie.maxAge > 0) parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.httpOnly ?? true) parts.push("HttpOnly");
  if (cookie.secure) parts.push("Secure");
  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite[0].toUpperCase()}${cookie.sameSite.slice(1)}`);
  }
  return parts.join("; ");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const login = await agentFetch<PmaLoginResponse>("/v1/phpmyadmin/login", { method: "POST" });
    const target = `http://${requestHostname(request)}:${login.port}${login.urlPath}`;
    const response = NextResponse.redirect(target, 302);
    response.headers.set("Cache-Control", "no-store");
    // Keep phpMyAdmin's cookies off the panel origin while still matching
    // every phpMyAdmin URL. Cookies ignore ports, so the browser sends these
    // to the phpMyAdmin port.
    const path = (login.urlPath || "/").replace(/[\r\n;]/g, "");
    for (const cookie of login.cookies) {
      if (cookie.name) response.headers.append("Set-Cookie", rawSetCookie(cookie, path));
    }
    return response;
  });
}
