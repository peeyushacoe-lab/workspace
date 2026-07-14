import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

export type PresenceStatus =
  | "online"
  | "away"
  | "busy"
  | "in_meeting"
  | "dnd"
  | "offline";

export interface PresenceData {
  status: PresenceStatus;
  customMessage?: string;
  updatedAt?: string;
}

const PRESENCE_TTL = 300;        // 5 minutes — key expires if no heartbeat
const LAST_SEEN_TTL = 60 * 60 * 24 * 30; // 30 days

function presenceKey(userId: string) { return `presence:${userId}`; }
function lastSeenKey(userId: string) { return `presence:lastseen:${userId}`; }

// ─── GET ?userIds=id1,id2,id3 ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("userIds") ?? "";

  if (!raw.trim()) {
    return NextResponse.json({ error: "userIds query parameter is required" }, { status: 400 });
  }

  const userIds = raw.split(",").map((id) => id.trim()).filter(Boolean);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "At least one userId is required" }, { status: 400 });
  }

  const result: Record<string, PresenceData> = {};

  // Batch with MGET — two round-trips for N users instead of 2N
  const presenceKeys = userIds.map(presenceKey);
  const lastSeenKeys = userIds.map(lastSeenKey);

  try {
    const [presenceVals, lastSeenVals] = await Promise.all([
      redis.mget(...presenceKeys),
      redis.mget(...lastSeenKeys),
    ]);

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const raw = presenceVals[i];
      if (raw) {
        try {
          result[userId] = JSON.parse(raw) as PresenceData;
          continue;
        } catch { /* corrupt — fall through to offline */ }
      }
      // Offline — include real last-seen timestamp if available
      const lastSeen = lastSeenVals[i];
      result[userId] = {
        status: "offline",
        ...(lastSeen ? { updatedAt: lastSeen } : {}),
      } as PresenceData;
    }
  } catch {
    // Redis unavailable — return all offline gracefully
    for (const userId of userIds) {
      result[userId] ??= { status: "offline" } as PresenceData;
    }
  }

  return NextResponse.json(result);
}

// ─── PATCH { status, customMessage? } ────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: unknown; customMessage?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const validStatuses: PresenceStatus[] = ["online", "away", "busy", "in_meeting", "dnd", "offline"];
  if (!body.status || !validStatuses.includes(body.status as PresenceStatus)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const data: PresenceData = {
    status: body.status as PresenceStatus,
    updatedAt: now,
    ...(typeof body.customMessage === "string" && body.customMessage.trim()
      ? { customMessage: body.customMessage.trim().slice(0, 200) }
      : {}),
  };

  await redis.set(presenceKey(user.id), JSON.stringify(data), "EX", PRESENCE_TTL);
  await redis.set(lastSeenKey(user.id), now, "EX", LAST_SEEN_TTL);

  return NextResponse.json({ ok: true, presence: data });
}

// ─── POST { heartbeat: true } ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { heartbeat?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.heartbeat) {
    return NextResponse.json({ error: "body must contain { heartbeat: true }" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await redis.set(lastSeenKey(user.id), now, "EX", LAST_SEEN_TTL);

  const existing = await redis.get(presenceKey(user.id));
  if (!existing) {
    const data: PresenceData = { status: "online", updatedAt: now };
    await redis.set(presenceKey(user.id), JSON.stringify(data), "EX", PRESENCE_TTL);
    return NextResponse.json({ ok: true, refreshed: false, created: true });
  }

  await redis.expire(presenceKey(user.id), PRESENCE_TTL);
  return NextResponse.json({ ok: true, refreshed: true });
}
