import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { indexingQueue } from "@/lib/queues/indexing.queue";
import { z } from "zod";

const createSchema = z.object({
  title:          z.string().min(1).max(200),
  description:    z.string().max(2000).optional(),
  scheduledAt:    z.string().optional(),
  isInstant:      z.boolean().optional().default(false),
  participantIds: z.array(z.string()).optional().default([]),
  passcode:       z.string().max(20).optional(),
  isRecordingEnabled:     z.boolean().optional().default(false),
  isTranscriptionEnabled: z.boolean().optional().default(false),
});

function generateRoomName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { organizerId: user.id },
        { participants: { some: { userId: user.id } } },
      ],
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(meetings);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const roomName = generateRoomName();

  const meeting = await prisma.meeting.create({
    data: {
      title:                  parsed.data.title,
      description:            parsed.data.description ?? null,
      organizerId:            user.id,
      roomName,
      scheduledAt:            parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
      status:                 parsed.data.isInstant ? "LIVE" : "SCHEDULED",
      passcode:               parsed.data.passcode ?? null,
      isRecordingEnabled:     parsed.data.isRecordingEnabled,
      isTranscriptionEnabled: parsed.data.isTranscriptionEnabled,
      participants: {
        create: [
          { userId: user.id, role: "HOST" },
          ...parsed.data.participantIds.map((pid) => ({ userId: pid, role: "PARTICIPANT" as const })),
        ],
      },
    },
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
    },
  });

  indexingQueue.add("index-meeting", {
    type: "INDEX",
    resource: "meeting",
    resourceId: meeting.id,
    content: `${meeting.title} ${meeting.description ?? ""}`,
    metadata: {
      organizerId: user.id,
      title: meeting.title,
      status: meeting.status,
      scheduledAt: (meeting.scheduledAt ?? new Date()).toISOString(),
    },
  }).catch(() => {});

  return NextResponse.json(meeting, { status: 201 });
}
