/**
 * Panel environment access. Values are read once at import time.
 */

const DEFAULT_AGENT_URL = "http://127.0.0.1:9090";
const DEFAULT_SESSION_SECRET = "dev-secret-change-me";

function resolveCookieSecure(): boolean {
  const override = process.env.PANEL_COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

const sessionSecret = process.env.PANEL_SESSION_SECRET || DEFAULT_SESSION_SECRET;

if (sessionSecret === DEFAULT_SESSION_SECRET) {
  console.warn(
    "[clouddeck] PANEL_SESSION_SECRET is not set; using the insecure development default. " +
      "Set PANEL_SESSION_SECRET before deploying the panel.",
  );
}

export const config = {
  agentUrl: (process.env.AGENT_URL || DEFAULT_AGENT_URL).replace(/\/+$/, ""),
  dataDir: process.env.PANEL_DATA_DIR || "./data",
  sessionSecret,
  cookieSecure: resolveCookieSecure(),
  seedAdmin: process.env.PANEL_SEED_ADMIN || "admin",
  seedPassword: process.env.PANEL_SEED_PASSWORD || "admin",
} as const;
