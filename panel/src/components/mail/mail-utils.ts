// Frozen by docs/api.md section 1.6 — mirror these hints in the UI.
export const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
export const LOCAL_PART_PATTERN = /^[a-z0-9]([a-z0-9._-]{0,62})?$/;
export const PASSWORD_MIN_LENGTH = 8;
export const QUOTA_MAX_MB = 1048576;

export function buildEmail(localPart: string, domain: string): string {
  return `${localPart.trim().toLowerCase()}@${domain}`;
}

export function quotaLabel(quotaMb: number): string {
  return quotaMb === 0 ? "Unlimited" : `${quotaMb.toLocaleString()} MB`;
}

/** Mirrors the agent's address rule (local part + domain shape), lowercased. */
export function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  const separator = email.indexOf("@");
  if (separator <= 0) return false;
  return (
    LOCAL_PART_PATTERN.test(email.slice(0, separator)) &&
    DOMAIN_PATTERN.test(email.slice(separator + 1))
  );
}
