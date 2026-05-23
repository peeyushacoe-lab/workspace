import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await prisma.chatChannel.findMany({
    where: { members: { some: { userId: user.userId } } },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, user: { select: { fullName: true } } },
      },
      _count: { select: { members: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      isPrivate: c.isPrivate,
      memberCount: c._count.members,
      lastMessage: c.messages[0]
        ? { content: c.messages[0].content.slice(0, 80), sender: c.messages[0].user.fullName, at: c.messages[0].createdAt }
        : null,
    })),
  );
}
