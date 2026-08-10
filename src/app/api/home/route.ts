import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getHomeData } from "@/lib/home";

/**
 * GET /api/home — everything the Nexus Home command centre renders.
 *
 * The page itself is a Server Component and calls `getHomeData` directly, so this
 * route exists for the two cases that cannot: the client-side Refresh control,
 * and the mobile app. Both want the same payload, so both share one aggregator
 * rather than reimplementing eight queries.
 *
 * Deliberately uncached. Home's whole value is that it is current — an unread
 * count served from a 60-second cache is worse than no unread count, because the
 * user trusts it and acts on it.
 */
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await getHomeData(user);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/home] failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to load home" }, { status: 500 });
  }
}
