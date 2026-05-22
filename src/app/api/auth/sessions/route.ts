import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentToken = cookieStore.get("cybersage_session")?.value ?? null;

  const sessions = await prisma.userSession.findMany({
    where: {
      userId: user.id,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      lastSeenAt: true,
      createdAt: true,
      expiresAt: true,
      token: true,
    },
  });

  const result = sessions.map((s) => ({
    id: s.id,
    deviceInfo: s.deviceInfo,
    ipAddress: s.ipAddress,
    lastSeenAt: s.lastSeenAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: currentToken !== null && s.token === currentToken,
  }));

  return NextResponse.json({ sessions: result });
}
