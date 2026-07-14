import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// A user is considered "online" if their last heartbeat was within this window.
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

// Map Prisma enum → API string
function toApiStatus(dbStatus: string, lastSeenAt: Date): PresenceStatus {
  const isRecent = Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
  if (!isRecent) return "offline";
  const map: Record<string, PresenceStatus> = {
    ONLINE: "online",
    AWAY: "away",
    BUSY: "busy",
    INVISIBLE: "offline",
    OFFLINE: "offline",
  };
  return map[dbStatus] ?? "offline";
}

// Map API string → Prisma enum
function toDbStatus(apiStatus: PresenceStatus): string {
  const map: Record<PresenceStatus, string> = {
    online: "ONLINE",
    away: "AWAY",
    busy: "BUSY",
    in_meeting: "BUSY",
    dnd: "BUSY",
    offline: "OFFLINE",
  };
  return map[apiStatus] ?? "OFFLINE";
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

  const userIds = raw.split(",").map((id) => id.trim()).filter(Boolean);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "At least one userId is required" }, { status: 400 });
  }

  // Single Postgres query for all users — no Redis needed
  const rows = await prisma.userPresence.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, status: true, statusMessage: true, lastSeenAt: true },
  });

  const byId = new Map(rows.map((r) => [r.userId, r]));
  const result: Record<string, PresenceData> = {};

  for (const userId of userIds) {
    const row = byId.get(userId);
    if (!row) {
      result[userId] = { status: "offline" };
      continue;
    }
    const status = toApiStatus(row.status, row.lastSeenAt);
    result[userId] = {
      status,
      ...(row.statusMessage ? { customMessage: row.statusMessage } : {}),
      // Only expose lastSeenAt when offline so UI can show "Last seen X ago"
      ...(status === "offline" ? { updatedAt: row.lastSeenAt.toISOString() } : {}),
    };
  }

  return NextResponse.json(result);
}

// ─── PATCH { status, customMessage? } ────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: unknown; customMessage?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validStatuses: PresenceStatus[] = ["online", "away", "busy", "in_meeting", "dnd", "offline"];
  if (!body.status || !validStatuses.includes(body.status as PresenceStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const apiStatus = body.status as PresenceStatus;
  const now = new Date();

  await prisma.userPresence.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: toDbStatus(apiStatus) as never,
      statusMessage: typeof body.customMessage === "string" ? body.customMessage.trim().slice(0, 200) : null,
      lastSeenAt: now,
    },
    update: {
      status: toDbStatus(apiStatus) as never,
      statusMessage: typeof body.customMessage === "string" ? body.customMessage.trim().slice(0, 200) : null,
      lastSeenAt: now,
    },
  });

  return NextResponse.json({ ok: true, presence: { status: apiStatus, updatedAt: now.toISOString() } });
}

// ─── POST { heartbeat: true } ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { heartbeat?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.heartbeat) {
    return NextResponse.json({ error: "body must contain { heartbeat: true }" }, { status: 400 });
  }

  const now = new Date();

  await prisma.userPresence.upsert({
    where: { userId: user.id },
    create: { userId: user.id, status: "ONLINE" as never, lastSeenAt: now },
    update: { status: "ONLINE" as never, lastSeenAt: now },
  });

  return NextResponse.json({ ok: true, refreshed: true });
}
