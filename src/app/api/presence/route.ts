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
  updatedAt: string;
}

const PRESENCE_TTL = 300; // 5 minutes
const LAST_SEEN_TTL = 60 * 60 * 24 * 30; // 30 days

function presenceKey(userId: string) {
  return `presence:${userId}`;
}

function lastSeenKey(userId: string) {
  return `presence:lastseen:${userId}`;
}

// ─── GET ?userIds=id1,id2,id3 ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("userIds") ?? "";

  if (!raw.trim()) {
    return NextResponse.json(
      { error: "userIds query parameter is required" },
      { status: 400 }
    );
  }

  const userIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "At least one userId is required" },
      { status: 400 }
    );
  }

  const result: Record<string, PresenceData> = {};

  await Promise.all(
    userIds.map(async (userId) => {
      const raw = await redis.get(presenceKey(userId));
      if (raw) {
        try {
          result[userId] = JSON.parse(raw) as PresenceData;
        } catch {
          // corrupt data → treat as offline
        }
      }
      if (!result[userId]) {
        // Try to get last seen timestamp for "Last seen X ago" display
        const lastSeen = await redis.get(lastSeenKey(userId));
        result[userId] = {
          status: "offline",
          updatedAt: lastSeen ?? new Date().toISOString(),
        };
      }
    })
  );

  return NextResponse.json(result);
}

// ─── PATCH { status, customMessage? } ────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: unknown; customMessage?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validStatuses: PresenceStatus[] = [
    "online",
    "away",
    "busy",
    "in_meeting",
    "dnd",
    "offline",
  ];

  if (!body.status || !validStatuses.includes(body.status as PresenceStatus)) {
    return NextResponse.json(
      {
        error: `status must be one of: ${validStatuses.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const data: PresenceData = {
    status: body.status as PresenceStatus,
    updatedAt: new Date().toISOString(),
    ...(typeof body.customMessage === "string" && body.customMessage.trim()
      ? { customMessage: body.customMessage.trim().slice(0, 200) }
      : {}),
  };

  await redis.set(presenceKey(user.id), JSON.stringify(data), "EX", PRESENCE_TTL);

  return NextResponse.json({ ok: true, presence: data });
}

// ─── POST { heartbeat: true } ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { heartbeat?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.heartbeat) {
    return NextResponse.json(
      { error: "body must contain { heartbeat: true }" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Always update last-seen (long-lived, survives the 5-min presence TTL)
  await redis.set(lastSeenKey(user.id), now, "EX", LAST_SEEN_TTL);

  const existing = await redis.get(presenceKey(user.id));

  if (!existing) {
    // User has no active presence — set them online by default
    const data: PresenceData = {
      status: "online",
      updatedAt: now,
    };
    await redis.set(presenceKey(user.id), JSON.stringify(data), "EX", PRESENCE_TTL);
    return NextResponse.json({ ok: true, refreshed: false, created: true });
  }

  // Reset TTL without changing stored data
  await redis.expire(presenceKey(user.id), PRESENCE_TTL);
  return NextResponse.json({ ok: true, refreshed: true });
}
