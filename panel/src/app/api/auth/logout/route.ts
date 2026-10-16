import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    await destroySession();
    return new NextResponse(null, { status: 204 });
  });
}
