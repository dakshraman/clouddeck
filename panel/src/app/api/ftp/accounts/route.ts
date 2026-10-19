import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import {
  optionalFtpSubdir,
  resolveFtpName,
  resolveFtpPassword,
  resolveFtpSite,
} from "@/app/api/ftp/shared";
import type { FtpAccountsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    return json(await agentFetch<FtpAccountsResponse>("/v1/ftp/accounts"));
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const body = await parseJsonBody(req);
    const site = resolveFtpSite(body.site);
    const name = resolveFtpName(typeof body.name === "string" ? body.name : "");
    const password = resolveFtpPassword(body.password);
    const subdir = optionalFtpSubdir(body.subdir);

    const payload: { site: string; name: string; password: string; subdir?: string } = {
      site,
      name,
      password,
    };
    if (subdir !== undefined) payload.subdir = subdir;

    // The agent answers with the full account list.
    return json(await agentFetch<FtpAccountsResponse>("/v1/ftp/accounts", { method: "POST", body: payload }));
  });
}
