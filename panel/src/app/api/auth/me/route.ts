import { NextResponse } from "next/server";
import { errorResponse, handleRoute, json } from "@/lib/http";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await getSession();
    if (!user) {
      return errorResponse(401, "unauthorized");
    }
    return json({ user });
  });
}
