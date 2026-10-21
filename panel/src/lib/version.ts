import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Panel version comes from package.json at runtime. In the standalone bundle
 * package.json sits next to server.js in the panel root (the systemd unit's
 * WorkingDirectory), so process.cwd() resolves it.
 */
export function getPanelVersion(): string {
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to the environment override.
  }
  return process.env.PANEL_VERSION?.trim() || "0.0.0";
}
