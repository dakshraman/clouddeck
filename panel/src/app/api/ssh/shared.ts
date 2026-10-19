import { HttpError } from "@/lib/http";

/**
 * docs/api.md section 1.9 (SSH keys) validation rules, mirrored so the panel
 * rejects bad input before it reaches the agent.
 */

export const SSH_KEY_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,31}$/;

const KEY_LINE_MAX = 8192;
const COMMENT_MAX = 1024;
const FINGERPRINT_MAX = 512;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;

// Frozen by docs/api.md section 1.9: ssh-ed25519, ssh-rsa and the three
// ecdsa-sha2-nistp* variants are the accepted public key types.
const KEY_PREFIXES = [
  "ssh-ed25519 ",
  "ssh-rsa ",
  "ecdsa-sha2-nistp256 ",
  "ecdsa-sha2-nistp384 ",
  "ecdsa-sha2-nistp521 ",
] as const;

/** Validates a generated keypair name (`^[a-z0-9][a-z0-9-]{0,31}$`), lowercased. */
export function resolveSshKeyName(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (!SSH_KEY_NAME_REGEX.test(name)) {
    throw new HttpError(
      400,
      "invalid key name; start with a letter or number, then lowercase letters, numbers and dashes (1-32 characters)",
      "invalid_name",
    );
  }
  return name;
}

/** Validates the generated keypair type: `ed25519` or `rsa`. */
export function resolveSshKeyType(raw: unknown): "ed25519" | "rsa" {
  if (raw !== "ed25519" && raw !== "rsa") {
    throw new HttpError(400, "type must be ed25519 or rsa", "invalid_key_type");
  }
  return raw;
}

/** Validates one OpenSSH public-key line. */
export function resolveSshKeyLine(raw: unknown): string {
  const line = typeof raw === "string" ? raw.trim() : "";
  if (
    line.length === 0 ||
    line.length > KEY_LINE_MAX ||
    CONTROL_CHARS_REGEX.test(line) ||
    !KEY_PREFIXES.some((prefix) => line.startsWith(prefix))
  ) {
    throw new HttpError(400, "invalid SSH public key", "invalid_key");
  }
  return line;
}

/** Validates the optional key comment. */
export function resolveSshComment(raw: unknown): string {
  if (raw === undefined) return "";
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid comment", "invalid_comment");
  }
  const comment = raw.trim();
  if (comment.length > COMMENT_MAX || CONTROL_CHARS_REGEX.test(comment)) {
    throw new HttpError(400, "invalid comment", "invalid_comment");
  }
  return comment;
}

/** `?fingerprint=` query values are already percent-decoded by the URL parser. */
export function resolveSshFingerprint(raw: string | null): string {
  const fingerprint = raw === null ? "" : raw.trim();
  if (
    fingerprint.length === 0 ||
    fingerprint.length > FINGERPRINT_MAX ||
    CONTROL_CHARS_REGEX.test(fingerprint)
  ) {
    throw new HttpError(400, "invalid fingerprint", "invalid_fingerprint");
  }
  return fingerprint;
}
