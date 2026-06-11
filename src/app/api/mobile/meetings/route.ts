import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

function generateRoomName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { organizerId: user.userId },
        { participants: { some: { userId: user.userId } } },
      ],
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        take: 10,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(meetings);
}

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    scheduledAt?: string;
    isInstant?: boolean;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: body.title.trim(),
      organizerId: user.userId,
      roomName: generateRoomName(),
      status: body.isInstant ? "LIVE" : "SCHEDULED",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      startedAt: body.isInstant ? new Date() : null,
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
    },
  });

  return NextResponse.json(meeting, { status: 201 });
}
