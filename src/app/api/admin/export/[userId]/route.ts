import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO"] as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Gather all data in parallel
  const [messages, chatMessages, driveFiles, calendarEvents, auditLogs] = await Promise.all([
    // Inbox messages via threads owned by the user's mailboxes
    prisma.inboxMessage.findMany({
      where: {
        thread: {
          mailbox: {
            accessLogs: { some: { userId } },
          },
        },
      },
      select: {
        id: true,
        from: true,
        to: true,
        subject: true,
        textBody: true,
        receivedAt: true,
      },
      take: 1000,
    }),
    // Chat messages
    prisma.chatMessage.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        channelId: true,
        content: true,
        createdAt: true,
      },
      take: 1000,
    }),
    // Drive files (metadata only)
    prisma.driveFile.findMany({
      where: { ownerId: userId, isTrashed: false },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
    }),
    // Calendar events the user organized
    prisma.calendarEvent.findMany({
      where: { organizerId: userId },
      select: {
        id: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        status: true,
      },
      take: 500,
    }),
    // Audit logs where user was the actor
    prisma.auditLog.findMany({
      where: { actorId: userId },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  // Log the export action
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "GDPR_EXPORT",
      targetType: "User",
      targetId: userId,
      metadata: { exportedBy: user.fullName, exportedAt: new Date().toISOString() },
    },
  });

  return NextResponse.json({
    user: targetUser,
    messages,
    chatMessages,
    driveFiles: driveFiles.map((f) => ({ ...f, size: Number(f.size) })),
    calendarEvents,
    auditLogs,
  });
}
