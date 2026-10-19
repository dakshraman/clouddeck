import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { DOMAIN_REGEX, HttpError, decodeDomainParam } from "@/lib/http";

/**
 * Shared helpers for the file-manager routes under
 * /api/sites/[domain]/files — mirrors the path/domain rules frozen by
 * docs/api.md section 1.1 so the panel rejects bad input before it reaches
 * the agent.
 */

export const AGENT_TIMEOUT_MS = 8000;

export interface RouteContext {
  params: Promise<{ domain: string }>;
}

export async function resolveDomain(ctx: RouteContext): Promise<string> {
  const { domain: raw } = await ctx.params;
  const domain = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain name");
  }
  return domain;
}

/** docs/api.md section 1.1 path rules, mirrored so the panel rejects early. */
export function isValidPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 1024) return false;
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) return false;
  if (path === "") return true;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Validates one webroot-relative path, with a caller-specific message/code. */
export function resolvePath(
  raw: unknown,
  message = "invalid path",
  code = "invalid_path",
): string {
  if (!isValidPath(raw)) {
    throw new HttpError(400, message, code);
  }
  return raw;
}

/** Validates a non-empty webroot-relative path (archives, copy destinations). */
export function resolveNonEmptyPath(
  raw: unknown,
  message = "invalid path",
  code = "invalid_path",
): string {
  const value = resolvePath(raw, message, code);
  if (value === "") {
    throw new HttpError(400, message, code);
  }
  return value;
}

/** Forwards the request and passes the agent's status + body through unchanged. */
export async function forwardToAgent(
  agentPath: string,
  init: { method: string; body?: unknown },
): Promise<NextResponse> {
  const hasBody = init.body !== undefined;

  let res: Response;
  try {
    res = await fetch(config.agentUrl + agentPath, {
      method: init.method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { error: { message: "CloudDeck agent is unreachable" } },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  return new NextResponse(await res.text(), { status: res.status, headers });
}

export function filesAgentPath(domain: string, suffix: string): string {
  return `/v1/sites/${encodeURIComponent(domain)}/files${suffix}`;
}
