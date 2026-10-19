import { DOMAIN_REGEX, HttpError } from "@/lib/http";

/**
 * docs/api.md section 1.9 validation rules for FTP logins, mirrored so the
 * panel rejects bad input before it reaches the agent.
 */
export const FTP_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,32}$/;
export const FTP_PASSWORD_MIN_LENGTH = 8;

/** Decodes one dynamic route segment; FTP login names are case-sensitive. */
export function decodeFtpName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence; validation below rejects it.
    return raw;
  }
}

/** Validates a virtual FTP login name (2-33 characters). */
export function resolveFtpName(raw: string): string {
  if (!FTP_NAME_REGEX.test(raw)) {
    throw new HttpError(400, "invalid FTP login name", "invalid_name");
  }
  return raw;
}

/** Validates an FTP password (>= 8 characters). */
export function resolveFtpPassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < FTP_PASSWORD_MIN_LENGTH) {
    throw new HttpError(
      400,
      `password must be at least ${FTP_PASSWORD_MIN_LENGTH} characters`,
      "invalid_password",
    );
  }
  return raw;
}

/** Validates the owning site domain using the frozen domain regex. */
export function resolveFtpSite(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid site domain", "invalid_domain");
  }
  const domain = raw.trim().toLowerCase();
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid site domain", "invalid_domain");
  }
  return domain;
}

/**
 * Validates the optional subdirectory inside the site webroot. Empty or
 * missing means the site root and is omitted from the agent request.
 */
export function optionalFtpSubdir(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string" || raw.length > 1024) {
    throw new HttpError(400, "invalid subdirectory", "invalid_path");
  }
  const subdir = raw;
  const segments = subdir.split("/");
  if (
    subdir.startsWith("/") ||
    subdir.includes("\\") ||
    subdir.includes("\0") ||
    !segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  ) {
    throw new HttpError(400, "invalid subdirectory", "invalid_path");
  }
  return subdir;
}
