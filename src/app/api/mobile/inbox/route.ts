import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const cursor = searchParams.get("cursor");

  const access = await prisma.mailboxAccess.findMany({
    where: { userId: user.userId },
    select: { mailboxId: true },
  });
  const mailboxIds = access.map((a) => a.mailboxId);

  const threads = await prisma.inboxThread.findMany({
    where: {
      mailboxId: { in: mailboxIds },
      isArchived: false,
      isTrashed: false,
      ...(q ? { subject: { contains: q, mode: "insensitive" } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: {
      messages: {
        select: { from: true, textBody: true, receivedAt: true, isRead: true },
        orderBy: { receivedAt: "desc" },
      },
      mailbox: { select: { id: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return NextResponse.json(
    threads.map((t) => {
      const last = t.messages[0];
      return {
        id: t.id,
        subject: t.subject,
        mailbox: t.mailbox.email,
        isStarred: t.isStarred,
        isArchived: t.isArchived,
        isTrashed: t.isTrashed,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        unreadCount: t.messages.filter((m) => !m.isRead).length,
        lastMessage: last
          ? { from: last.from, snippet: (last.textBody ?? "").slice(0, 120), receivedAt: last.receivedAt }
          : null,
      };
    }),
  );
}
