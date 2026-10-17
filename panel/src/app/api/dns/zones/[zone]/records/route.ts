import { NextResponse, type NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import {
  DOMAIN_REGEX,
  HttpError,
  decodeDomainParam,
  handleRoute,
  json,
  parseJsonBody,
  requireAuth,
} from "@/lib/http";
import type { CreateDNSRecordRequest, DNSRecord, DNSRecordListResponse, DNSRecordType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Frozen by docs/api.md section 1.4.
const RECORD_TYPES: readonly DNSRecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
const RECORD_NAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const RECORD_NAME_MAX = 253;
const RECORD_CONTENT_MAX = 512;
const RECORD_TTL_MAX = 604800;
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;

interface RouteContext {
  params: Promise<{ zone: string }>;
}

async function resolveZone(ctx: RouteContext): Promise<string> {
  const { zone: raw } = await ctx.params;
  const zone = decodeDomainParam(raw);
  if (!DOMAIN_REGEX.test(zone)) {
    throw new HttpError(400, "invalid zone name", "invalid_zone");
  }
  return zone;
}

function resolveRecordName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (name === "@") return name;
  if (name.length > RECORD_NAME_MAX || !RECORD_NAME_REGEX.test(name)) {
    throw new HttpError(400, "invalid record name", "invalid_record");
  }
  return name;
}

function resolveRecordType(raw: unknown): DNSRecordType {
  const type = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!(RECORD_TYPES as readonly string[]).includes(type)) {
    throw new HttpError(400, "invalid record type", "invalid_record");
  }
  return type as DNSRecordType;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const zone = await resolveZone(ctx);
    return json(
      await agentFetch<DNSRecordListResponse>(
        `/v1/dns/zones/${encodeURIComponent(zone)}/records`,
      ),
    );
  });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const zone = await resolveZone(ctx);

    const body = await parseJsonBody(req);
    const name = resolveRecordName(body.name);
    const type = resolveRecordType(body.type);

    const { content, ttl } = body;
    if (
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > RECORD_CONTENT_MAX ||
      CONTROL_CHARS_REGEX.test(content)
    ) {
      throw new HttpError(400, "invalid record content", "invalid_record");
    }

    const payload: CreateDNSRecordRequest = { name, type, content };
    if (ttl !== undefined) {
      if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 0 || ttl > RECORD_TTL_MAX) {
        throw new HttpError(400, "invalid ttl", "invalid_record");
      }
      payload.ttl = ttl;
    }

    const created = await agentFetch<{ record: DNSRecord }>(
      `/v1/dns/zones/${encodeURIComponent(zone)}/records`,
      { method: "POST", body: payload },
    );
    return json(created, 201);
  });
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();
    const zone = await resolveZone(ctx);

    const name = resolveRecordName(req.nextUrl.searchParams.get("name"));
    const type = resolveRecordType(req.nextUrl.searchParams.get("type"));

    const deleted = await agentFetch<{ name: string; type: string; deleted: boolean }>(
      `/v1/dns/zones/${encodeURIComponent(zone)}/records?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      { method: "DELETE" },
    );
    return json(deleted);
  });
}
