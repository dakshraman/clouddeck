import { type NextRequest, NextResponse } from "next/server";
import { getProcesses, killProcess } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PIDs this panel instance must never kill: itself and its direct parent.
// `next start` serves routes from a next-server child, so the CLI launcher
// is the parent of process.pid here.
const protectedPids = new Set<number>([process.pid, process.ppid]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const sort = request.nextUrl.searchParams.get("sort") === "mem" ? "mem" : "cpu";
    const data = await getProcesses(sort);
    return json({
      ...data,
      // The panel cannot offer to kill itself: the request would die with it.
      processes: data.processes.map((item) => ({
        ...item,
        killable: item.killable === true && !protectedPids.has(item.pid),
      })),
    });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const body = await parseJsonBody(request);
    const pid = body.pid;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
      throw new HttpError(400, "pid must be a positive integer", "invalid_pid");
    }
    if (protectedPids.has(pid)) {
      throw new HttpError(403, "the panel process cannot be killed", "process_protected");
    }
    return json(await killProcess(pid));
  });
}
