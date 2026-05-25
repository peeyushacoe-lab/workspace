import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;

  const draft = await prisma.chatChannelDraft.findUnique({
    where: { channelId_userId: { channelId, userId: user.userId } },
  });

  return NextResponse.json({ content: draft?.content ?? "" });
}

export async function PUT(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const { content } = await request.json() as { content: string };

  if (content === "" || content === null || content === undefined) {
    await prisma.chatChannelDraft.deleteMany({
      where: { channelId, userId: user.userId },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.chatChannelDraft.upsert({
    where: { channelId_userId: { channelId, userId: user.userId } },
    update: { content },
    create: { channelId, userId: user.userId, content },
  });

  return NextResponse.json({ ok: true });
}
