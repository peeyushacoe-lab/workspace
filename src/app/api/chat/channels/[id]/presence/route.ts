import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

const PRESENCE_TTL_MS = 60_000; // 60s — client heartbeats every 30s

function presenceKey(channelId: string) {
  return `presence:ch:${channelId}`;
}

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const raw = await redis.hgetall(presenceKey(channelId));
    const now = Date.now();
    const online: { userId: string; fullName: string }[] = [];

    if (raw) {
      for (const [userId, val] of Object.entries(raw)) {
        try {
          const entry = JSON.parse(val) as { fullName: string; lastSeen: number };
          if (now - entry.lastSeen < PRESENCE_TTL_MS) {
            online.push({ userId, fullName: entry.fullName });
          }
        } catch {}
      }
    }

    return NextResponse.json(online);
  } catch (err) {
    console.error("[chat/presence GET] Redis error:", (err as Error).message);
    return NextResponse.json([]);
  }
}

export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key = presenceKey(channelId);
  const entry = JSON.stringify({ fullName: user.fullName, lastSeen: Date.now() });

  // Non-fatal — if Redis is unavailable, presence just won't show
  try {
    await redis.hset(key, { [user.id]: entry });
    await redis.expire(key, 120);
    await redis.publish(
      `chat:channel:${channelId}`,
      JSON.stringify({ type: "presence", data: { userId: user.id, fullName: user.fullName, online: true } }),
    );
  } catch (err) {
    console.error("[chat/presence POST] Redis error:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const key = presenceKey(channelId);

  try {
    await redis.hdel(key, user.id);
    await redis.publish(
      `chat:channel:${channelId}`,
      JSON.stringify({ type: "presence", data: { userId: user.id, fullName: user.fullName, online: false } }),
    );
  } catch (err) {
    console.error("[chat/presence DELETE] Redis error:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
