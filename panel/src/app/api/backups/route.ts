import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import {
  DOMAIN_REGEX,
  HttpError,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";
import type { BackupListResponse, BackupUploadTarget, CreateBackupRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** docs/api.md section 1.2 identifier rules, mirrored so the panel rejects early. */
const DATABASE_NAME_REGEX = /^[A-Za-z0-9_]{1,64}$/;

/** Mirrors the agent's rclone remote rule: "name:path". */
const RCLONE_REMOTE_REGEX = /^[A-Za-z0-9_.-]+:.+$/;

/** docs/api.md section 1.5 upload rules, mirrored so the panel rejects early. */
function parseUploads(raw: unknown): BackupUploadTarget[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new HttpError(400, "uploads must be an array", "invalid_request");
  }
  return raw.map((entry): BackupUploadTarget => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new HttpError(400, "invalid upload target", "invalid_request");
    }
    const { type, remote } = entry as { type?: unknown; remote?: unknown };
    if (type === "telegram") {
      return { type: "telegram" };
    }
    if (type === "rclone") {
      if (typeof remote !== "string" || !RCLONE_REMOTE_REGEX.test(remote.trim())) {
        throw new HttpError(400, 'rclone remote must look like "name:path"', "invalid_request");
      }
      return { type: "rclone", remote: remote.trim() };
    }
    throw new HttpError(400, 'upload type must be "telegram" or "rclone"', "invalid_request");
  });
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<BackupListResponse>("/v1/backups"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const kind = body.kind;
    if (kind !== "site" && kind !== "database") {
      throw new HttpError(400, 'kind must be "site" or "database"', "invalid_request");
    }

    const uploads = parseUploads(body.uploads);

    const request: CreateBackupRequest = { kind };
    if (kind === "site") {
      const site = body.site;
      if (typeof site !== "string") {
        throw new HttpError(400, "site is required for a site backup", "invalid_request");
      }
      const domain = site.toLowerCase();
      if (!DOMAIN_REGEX.test(domain)) {
        throw new HttpError(400, "invalid site name", "invalid_request");
      }
      request.site = domain;
    } else {
      const database = body.database;
      if (typeof database !== "string" || !DATABASE_NAME_REGEX.test(database)) {
        throw new HttpError(400, "invalid database name", "invalid_request");
      }
      request.database = database;
    }

    if (uploads.length > 0) {
      request.uploads = uploads;
    }

    const { taskId } = await agentFetch<{ taskId: string }>("/v1/backups", {
      method: "POST",
      body: request,
    });
    return json({ taskId }, 202);
  });
}
