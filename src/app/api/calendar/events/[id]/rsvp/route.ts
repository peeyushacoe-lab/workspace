import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const { status } = (await request.json()) as {
    status: "ACCEPTED" | "DECLINED" | "MAYBE";
  };

  if (!["ACCEPTED", "DECLINED", "MAYBE"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const attendee = await prisma.eventAttendee.findFirst({
    where: { eventId, userId: user.id },
  });

  if (!attendee) {
    return NextResponse.json({ error: "You are not invited to this event" }, { status: 403 });
  }

  const updated = await prisma.eventAttendee.update({
    where: { id: attendee.id },
    data: { status },
  });

  return NextResponse.json(updated);
}
