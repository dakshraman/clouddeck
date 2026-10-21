import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, json, requireAuth } from "@/lib/http";
import { getPanelVersion } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LatestRelease {
  version: string;
  url: string;
  publishedAt: string | null;
}

interface CacheEntry {
  at: number;
  latest: LatestRelease | null;
  error: string | null;
}

const REPO = "dakshraman/clouddeck";
const CACHE_MS = 10 * 60 * 1000;
// A manual check never hammers GitHub more than once a minute.
const MIN_REFRESH_MS = 60 * 1000;

let cache: CacheEntry | null = null;

async function fetchLatestRelease(): Promise<LatestRelease> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "clouddeck-panel",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`GitHub returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    tag_name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
  };
  if (typeof data.tag_name !== "string" || data.tag_name.length === 0) {
    throw new Error("GitHub returned no release tag");
  }
  return {
    version: data.tag_name.replace(/^v/, ""),
    url:
      typeof data.html_url === "string"
        ? data.html_url
        : `https://github.com/${REPO}/releases`,
    publishedAt: typeof data.published_at === "string" ? data.published_at : null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    await requireAuth();

    const force = req.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();
    const expired = !cache || now - cache.at > CACHE_MS;
    const manualRefresh = force && (!cache || now - cache.at > MIN_REFRESH_MS);

    if (expired || manualRefresh) {
      try {
        cache = { at: now, latest: await fetchLatestRelease(), error: null };
      } catch (err) {
        cache = {
          at: now,
          latest: cache?.latest ?? null,
          error: err instanceof Error ? err.message : "update check failed",
        };
      }
    }

    return json({
      panelVersion: getPanelVersion(),
      latest: cache?.latest ?? null,
      checkedAt: cache ? new Date(cache.at).toISOString() : null,
      error: cache?.error ?? null,
    });
  });
}
