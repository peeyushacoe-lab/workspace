import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { receivedAt: "asc" },
        select: { id: true, from: true, to: true, subject: true, textBody: true, htmlBody: true, isRead: true, receivedAt: true },
      },
      mailbox: { select: { id: true, email: true } },
    },
  });

  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify the user has access to this mailbox
  const access = await prisma.mailboxAccess.findUnique({
    where: { mailboxId_userId: { mailboxId: thread.mailboxId, userId: user.userId } },
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Mark all messages as read
  await prisma.inboxMessage.updateMany({
    where: { threadId: id, isRead: false },
    data: { isRead: true },
  }).catch(() => {});

  return NextResponse.json(thread);
}

export async function PUT(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    select: { mailboxId: true },
  });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await prisma.mailboxAccess.findUnique({
    where: { mailboxId_userId: { mailboxId: thread.mailboxId, userId: user.userId } },
  });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    isStarred?: boolean;
    isArchived?: boolean;
    isTrashed?: boolean;
    priority?: string;
  };

  const updated = await prisma.inboxThread.update({
    where: { id },
    data: {
      ...(body.isStarred  !== undefined ? { isStarred:  body.isStarred  } : {}),
      ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
      ...(body.isTrashed  !== undefined ? { isTrashed:  body.isTrashed  } : {}),
    },
    select: { id: true, isStarred: true, isArchived: true, isTrashed: true },
  });

  return NextResponse.json(updated);
}
