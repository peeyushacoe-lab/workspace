import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fire-and-forget — non-fatal if Redis is unavailable
  redis.publish(
    `chat:channel:${channelId}`,
    JSON.stringify({ type: "typing", data: { userId: user.id, fullName: user.fullName, channelId } }),
  ).catch((err: Error) => {
    console.error("[chat/typing] Redis publish failed:", err.message);
  });

  return NextResponse.json({ ok: true });
}
