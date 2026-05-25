import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await getMobileUser(_request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { fullName: true, displayName: true },
  });

  redis.publish(
    `chat:channel:${channelId}`,
    JSON.stringify({ type: "typing", data: { userId: user.userId, fullName: profile?.displayName ?? profile?.fullName ?? user.email } }),
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
