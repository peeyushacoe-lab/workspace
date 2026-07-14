import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { indexingQueue } from "@/lib/queues/indexing.queue";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
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
    include: {
      organizer: { select: { id: true, fullName: true, avatarUrl: true } },
      participants: {
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
    },
  });

  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const meeting = await prisma.meeting.findFirst({ where: { id, organizerId: user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found or not organizer" }, { status: 404 });

  const body = (await request.json()) as {
    status?: string;
    endedAt?: string;
    startedAt?: string;
    aiSummary?: string;
    transcriptUrl?: string;
    actionItems?: string[];
  };

  const updated = await prisma.meeting.update({
    where: { id },
    data: {
      ...(body.status     ? { status: body.status as never } : {}),
      ...(body.endedAt    ? { endedAt: new Date(body.endedAt) } : {}),
      ...(body.startedAt  ? { startedAt: new Date(body.startedAt) } : {}),
      ...(body.aiSummary !== undefined        ? { aiSummary: body.aiSummary } : {}),
      ...(body.transcriptUrl !== undefined    ? { transcriptUrl: body.transcriptUrl } : {}),
      ...(body.actionItems !== undefined      ? { actionItems: body.actionItems } : {}),
    },
  });

  if (updated.status === "CANCELLED") {
    indexingQueue.add("deindex-meeting", { type: "DEINDEX", resource: "meeting", resourceId: id }).catch(() => {});
  } else {
    indexingQueue.add("index-meeting", {
      type: "INDEX",
      resource: "meeting",
      resourceId: id,
      content: `${updated.title} ${updated.description ?? ""}`,
      metadata: {
        organizerId: user.id,
        title: updated.title,
        status: updated.status,
        scheduledAt: (updated.scheduledAt ?? new Date()).toISOString(),
      },
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const meeting = await prisma.meeting.findFirst({ where: { id, organizerId: user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found or not organizer" }, { status: 404 });

  await prisma.meeting.delete({ where: { id } });
  indexingQueue.add("deindex-meeting", { type: "DEINDEX", resource: "meeting", resourceId: id }).catch(() => {});
  return NextResponse.json({ deleted: true });
}
