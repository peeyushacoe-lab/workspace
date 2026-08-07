import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJitsiJwt, jitsiJwtEnabled } from "@/lib/jitsi";

/**
 * GET /api/meet/token?room=ROOM_NAME
 *
 * Returns a short-lived Jitsi JWT for the requesting user so the browser
 * embed can authenticate against a self-hosted instance. When JITSI_JWT_*
 * vars are not set (public meet.jit.si), responds with { jwt: null } so
 * callers can branch without a second round-trip.
 *
 * The room name is validated against Meeting records so a logged-in user
 * can't mint a token for an arbitrary room they were never invited to.
 * On the public server (jitsiJwtEnabled() === false) the validation still
 * runs — it's cheap and consistent, and avoids a confusing success response
 * for a meeting that doesn't exist.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("room");
  if (!roomName) return NextResponse.json({ error: "room is required" }, { status: 400 });

  const meeting = await prisma.meeting.findFirst({
    where: {
      roomName,
      OR: [
        { organizerId: user.id },
        { participants: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  });

  if (!meeting) return NextResponse.json({ error: "Not found or not invited" }, { status: 404 });

  if (!jitsiJwtEnabled()) {
    return NextResponse.json({ jwt: null });
  }

  const userFull = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, fullName: true },
  });

  const jwt = await generateJitsiJwt(roomName, {
    id: user.id,
    name: userFull?.fullName ?? user.fullName,
    email: userFull?.email ?? user.email,
  });

  return NextResponse.json({ jwt });
}
