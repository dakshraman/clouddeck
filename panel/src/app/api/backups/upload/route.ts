import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { agentHeaders } from "@/lib/agent-headers";
import { HttpError, handleRoute, requireAuth } from "@/lib/http";
import type { BackupUploadResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_TIMEOUT_MS = 600_000;

const BACKUP_ID_REGEX = /^[a-z0-9][a-z0-9._-]{0,199}$/;
const SITE_BACKUP_REGEX = /^site-(.+)-([0-9]{1,10})\.(zip|tar\.gz)$/;
const DB_BACKUP_REGEX = /^database-([a-z0-9_]{1,64})-([0-9]{1,10})\.(zip|sql\.gz)$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "invalid multipart form body", "invalid_multipart");
    }

    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      throw new HttpError(400, 'form field "file" is required', "invalid_request");
    }

    const filename = file.name.toLowerCase();
    if (!BACKUP_ID_REGEX.test(filename) || (!SITE_BACKUP_REGEX.test(filename) && !DB_BACKUP_REGEX.test(filename))) {
      throw new HttpError(
        400,
        `invalid backup filename "${file.name}". Must match site-<domain>-<unix>.zip or database-<name>-<unix>.zip`,
        "invalid_id",
      );
    }

    const outgoing = new FormData();
    outgoing.append("file", file, filename);

    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}/v1/backups/upload`, {
        method: "POST",
        headers: agentHeaders(),
        body: outgoing,
        cache: "no-store",
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      });
    } catch {
      return NextResponse.json(
        { error: { message: "CloudDeck agent is unreachable" } },
        { status: 502 },
      );
    }

    const data = (await res.json()) as BackupUploadResponse | { error?: { message?: string } };
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } }).error?.message ?? `Agent returned HTTP ${res.status}`;
      return NextResponse.json({ error: { message: msg } }, { status: res.status });
    }

    return NextResponse.json(data, { status: res.status });
  });
}
