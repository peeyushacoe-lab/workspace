import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/meet/:id/join
 * Records participation and returns Jitsi Meet connection info.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: {
      id,
      OR: [
        { organizerId: user.id },
        { participants: { some: { userId: user.id } } },
      ],
    },
  });

  if (!meeting) return NextResponse.json({ error: "Not found or not invited" }, { status: 404 });
  if (meeting.status === "ENDED") return NextResponse.json({ error: "Meeting has ended" }, { status: 410 });

  // Record participation
  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: id, userId: user.id } },
    create: { meetingId: id, userId: user.id, role: "PARTICIPANT", joinedAt: new Date() },
    update: { joinedAt: new Date() },
  });

  // Activate meeting if it was scheduled
  if (meeting.status === "SCHEDULED") {
    await prisma.meeting.update({ where: { id }, data: { status: "LIVE", startedAt: new Date() } });
  }

  // Jitsi Meet — use configurable domain (default: public meet.jit.si)
  const jitsiDomain = process.env.JITSI_DOMAIN ?? "meet.jit.si";
  const jitsiUrl = `https://${jitsiDomain}/${encodeURIComponent(meeting.roomName)}`;

  return NextResponse.json({
    roomName: meeting.roomName,
    jitsiUrl,
    jitsiDomain,
    userId: user.id,
    userName: user.fullName,
  });
}
