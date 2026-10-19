import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { HttpError, errorResponse } from "@/lib/http";

/**
 * Shared helpers for the terminal proxy routes (docs/api.md section 1.9).
 * Terminal mutations answer `204 No Content`, which agentFetch cannot
 * represent (it requires a JSON body), so they use a raw passthrough.
 */

export const TERM_MIN_DIMENSION = 8;
export const TERM_MAX_DIMENSION = 500;
export const TERM_DEFAULT_COLS = 80;
export const TERM_DEFAULT_ROWS = 24;

const SESSION_ID_MAX = 200;
const CONTROL_OR_PATH_CHARS = /[\u0000-\u001F\u007F/\\]/;
const AGENT_TIMEOUT_MS = 8000;

/** Validates one `{id}` dynamic route segment. */
export function resolveTermSessionId(raw: string): string {
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; validation below rejects it.
    id = raw;
  }
  if (id.length === 0 || id.length > SESSION_ID_MAX || CONTROL_OR_PATH_CHARS.test(id)) {
    throw new HttpError(400, "invalid session id", "invalid_session");
  }
  return id;
}

/** Validates one PTY dimension (cols and rows share the same 8-500 bounds). */
export function resolveTermDimension(raw: unknown, fallback?: number): number {
  if (raw === undefined) {
    if (fallback !== undefined) return fallback;
    throw new HttpError(
      400,
      `cols and rows must be whole numbers between ${TERM_MIN_DIMENSION} and ${TERM_MAX_DIMENSION}`,
      "invalid_size",
    );
  }
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < TERM_MIN_DIMENSION ||
    raw > TERM_MAX_DIMENSION
  ) {
    throw new HttpError(
      400,
      `cols and rows must be whole numbers between ${TERM_MIN_DIMENSION} and ${TERM_MAX_DIMENSION}`,
      "invalid_size",
    );
  }
  return raw;
}

/**
 * Forwards one request to the agent and returns its status + body unchanged,
 * 204 included. Mirrors the file-manager passthrough routes.
 */
export async function agentPassThrough(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<NextResponse> {
  const hasBody = init?.body !== undefined;

  let res: Response;
  try {
    res = await fetch(config.agentUrl + path, {
      method: init?.method ?? "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
  } catch {
    return errorResponse(502, "CloudDeck agent is unreachable");
  }

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  return new NextResponse(await res.text(), { status: res.status, headers });
}
