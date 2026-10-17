import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { HttpError, handleRoute, json, parseJsonBody, requireAuth } from "@/lib/http";
import { decodeMailParam, resolveMailEmail } from "@/app/api/mail/shared";
import type { MailAutoresponder } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBJECT_MAX = 512;
const BODY_MAX = 65535;

interface RouteContext {
  params: Promise<{ email: string }>;
}

async function resolveEmail(ctx: RouteContext): Promise<string> {
  const { email: raw } = await ctx.params;
  return resolveMailEmail(decodeMailParam(raw));
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const email = await resolveEmail(ctx);
    return json(
      await agentFetch<MailAutoresponder>(
        `/v1/mail/autoresponders/${encodeURIComponent(email)}`,
      ),
    );
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const email = await resolveEmail(ctx);

    const body = await parseJsonBody(req);
    const { subject, body: message, enabled } = body;
    if (
      typeof subject !== "string" ||
      subject.length > SUBJECT_MAX ||
      typeof message !== "string" ||
      message.length > BODY_MAX ||
      typeof enabled !== "boolean"
    ) {
      throw new HttpError(400, "invalid autoresponder", "invalid_autoresponder");
    }

    const saved = await agentFetch<MailAutoresponder>(
      `/v1/mail/autoresponders/${encodeURIComponent(email)}`,
      { method: "PUT", body: { subject, body: message, enabled } },
    );
    return json(saved);
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const email = await resolveEmail(ctx);

    const deleted = await agentFetch<{ email: string; deleted: boolean }>(
      `/v1/mail/autoresponders/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
