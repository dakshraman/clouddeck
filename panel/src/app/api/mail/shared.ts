import { DOMAIN_REGEX, HttpError } from "@/lib/http";

/**
 * docs/api.md section 1.6 validation rules, mirrored so the panel rejects bad
 * input before it reaches the agent. Emails are always lowercased.
 */
export const MAIL_LOCAL_PART_REGEX = /^[a-z0-9]([a-z0-9._-]{0,62})?$/;
export const MAIL_PASSWORD_MIN_LENGTH = 8;
export const MAIL_QUOTA_MAX_MB = 1048576;

/** Decodes one dynamic route segment; mail identifiers are lowercased. */
export function decodeMailParam(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    // Malformed escape sequence; validation below rejects it.
    return raw.toLowerCase();
  }
}

/** Validates a mail domain using the frozen domain regex. */
export function resolveMailDomain(raw: string): string {
  const domain = raw.trim().toLowerCase();
  if (!DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid domain", "invalid_domain");
  }
  return domain;
}

/** Validates a full address (local part + domain shape); lowercased. */
export function resolveMailEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const separator = email.indexOf("@");
  const local = separator > 0 ? email.slice(0, separator) : "";
  const domain = separator > 0 ? email.slice(separator + 1) : "";
  if (!MAIL_LOCAL_PART_REGEX.test(local) || !DOMAIN_REGEX.test(domain)) {
    throw new HttpError(400, "invalid email address", "invalid_email");
  }
  return email;
}

/** Validates a mailbox quota in MB; 0 means unlimited. */
export function resolveMailQuota(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > MAIL_QUOTA_MAX_MB) {
    throw new HttpError(
      400,
      `quotaMb must be a whole number between 0 and ${MAIL_QUOTA_MAX_MB} (0 = unlimited)`,
      "invalid_quota",
    );
  }
  return raw;
}

/** Validates a mailbox password (>= 8 characters). */
export function resolveMailPassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < MAIL_PASSWORD_MIN_LENGTH) {
    throw new HttpError(
      400,
      `password must be at least ${MAIL_PASSWORD_MIN_LENGTH} characters`,
      "invalid_password",
    );
  }
  return raw;
}

/**
 * One address or a comma-separated list of addresses (forwarder targets).
 * Individual addresses must be syntactically valid; the agent decides whether
 * a target domain is acceptable.
 */
export function resolveMailTargets(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid target address", "invalid_email");
  }
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) {
    throw new HttpError(400, "invalid target address", "invalid_email");
  }
  return parts.map((part) => resolveMailEmail(part)).join(", ");
}

/** `?domain=` query values are already percent-decoded by the URL parser. */
export function optionalMailDomain(raw: string | null): string | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  return resolveMailDomain(raw);
}
