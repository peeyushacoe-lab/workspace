import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const saved = await prisma.savedChatMessage.findMany({
    where: { userId: user.userId },
    orderBy: { savedAt: "desc" },
    take: 50,
    include: {
      message: {
        select: {
          id: true, content: true, createdAt: true,
          channel: { select: { id: true, name: true } },
          user: { select: { fullName: true, avatarUrl: true } },
        },
      },
    },
  });

  return NextResponse.json(saved);
}

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await request.json() as { messageId: string };
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  const existing = await prisma.savedChatMessage.findUnique({
    where: { messageId_userId: { messageId, userId: user.userId } },
  });

  if (existing) {
    await prisma.savedChatMessage.delete({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  }

  await prisma.savedChatMessage.create({ data: { messageId, userId: user.userId } });
  return NextResponse.json({ saved: true });
}
