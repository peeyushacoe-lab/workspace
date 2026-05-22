import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ChatChannelType } from "@/generated/prisma/enums";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channels = await prisma.chatChannel.findMany({
    where: {
      members: { some: { userId: user.id } },
    },
    include: {
      members: { select: { userId: true, role: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(channels, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    name: string;
    description?: string;
    type?: ChatChannelType;
    isPrivate?: boolean;
    memberIds?: string[];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Channel name is required" }, { status: 400 });
  }

  const memberIds = Array.from(new Set([user.id, ...(body.memberIds ?? [])]));

  const channel = await prisma.chatChannel.create({
    data: {
      name: body.name.trim(),
      description: body.description,
      type: body.type ?? "CHANNEL",
      isPrivate: body.isPrivate ?? false,
      createdById: user.id,
      members: {
        create: memberIds.map((id) => ({
          userId: id,
          role: id === user.id ? "ADMIN" : "MEMBER",
        })),
      },
    },
    include: {
      members: { select: { userId: true, role: true } },
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
