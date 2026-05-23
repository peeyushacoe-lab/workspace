import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : new Date();
  const to   = searchParams.get("to")   ? new Date(searchParams.get("to")!)   : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { organizerId: user.userId },
        { attendees: { some: { userId: user.userId } } },
      ],
      startAt: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    include: {
      attendees: { select: { userId: true, email: true, name: true, status: true } },
    },
    orderBy: { startAt: "asc" },
    take: 50,
  });

  return NextResponse.json(events);
}
