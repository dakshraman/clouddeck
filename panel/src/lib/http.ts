import { NextResponse, type NextRequest } from "next/server";
import { AgentError } from "@/lib/agent";
import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/users";
import type { SessionUser } from "@/lib/types";

/** Frozen by docs/api.md section 4 — lowercase before testing. */
export const DOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(status: number, message: string, code?: string): NextResponse {
  // An undefined code is omitted by JSON.stringify, so 401 stays exactly
  // {"error":{"message":"unauthorized"}} as required by docs/api.md section 2.
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function requireAuth(): Promise<SessionUser> {
  if (!isSetupComplete()) {
    throw new HttpError(403, "setup required", "setup_required");
  }
  const user = await getSession();
  if (!user) {
    throw new HttpError(401, "unauthorized");
  }
  return user;
}

export async function parseJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    throw new HttpError(400, "invalid request body");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "invalid request body");
  }
  return payload as Record<string, unknown>;
}

export function decodeDomainParam(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    // Malformed escape sequence; DOMAIN_REGEX validation rejects it downstream.
    return raw.toLowerCase();
  }
}

export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return errorResponse(err.status, err.message, err.code);
    }
    if (err instanceof AgentError) {
      return errorResponse(err.status, err.message, err.code);
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    return errorResponse(500, "internal error");
  }
}
