import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/meet/:id/join
 * Returns the LiveKit room token and connection info.
 * If LIVEKIT_API_KEY is not set, returns a stub token for development.
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

  // Add participant if not already there
  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: id, userId: user.id } },
    create: { meetingId: id, userId: user.id, role: "PARTICIPANT", joinedAt: new Date() },
    update: { joinedAt: new Date() },
  });

  // Activate meeting if it was scheduled
  if (meeting.status === "SCHEDULED") {
    await prisma.meeting.update({ where: { id }, data: { status: "LIVE", startedAt: new Date() } });
  }

  // LiveKit token generation (requires livekit-server-sdk)
  if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    try {
      const { AccessToken } = await import("livekit-server-sdk" as never) as { AccessToken: new (...args: unknown[]) => { addGrant: (g: unknown) => void; toJwt: () => Promise<string> } };
      const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: user.id,
        name: user.fullName,
        ttl: "4h",
      } as unknown as never);
      at.addGrant({ roomJoin: true, room: meeting.roomName, canPublish: true, canSubscribe: true });
      const token = await at.toJwt();
      return NextResponse.json({
        token,
        roomName: meeting.roomName,
        wsUrl: process.env.LIVEKIT_WS_URL ?? "wss://your-livekit-instance.livekit.cloud",
        userId: user.id,
        userName: user.fullName,
      });
    } catch {
      // Fall through to stub
    }
  }

  // Development stub (no LiveKit configured)
  return NextResponse.json({
    token: `stub_token_${user.id}_${meeting.roomName}`,
    roomName: meeting.roomName,
    wsUrl: null,
    userId: user.id,
    userName: user.fullName,
    stub: true,
  });
}
