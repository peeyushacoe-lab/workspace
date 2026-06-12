import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

async function checkThreadAccess(threadId: string, userId: string, role: string, userEmail?: string) {
  const thread = await prisma.inboxThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      mailbox: {
        select: {
          email: true,
          accessLogs: { where: { userId }, select: { userId: true }, take: 1 },
        },
      },
    },
  });
  if (!thread) return null;
  const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(role);
  // User owns this mailbox (their email matches mailbox email) OR has an explicit MailboxAccess entry
  const isOwner = !!userEmail && thread.mailbox.email === userEmail;
  const isAssigned = isOwner || (thread.mailbox.accessLogs.length ?? 0) > 0;
  if (!isPrivileged && !isAssigned) return null;
  return thread;
}

export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    include: {
      folder: { select: { id: true, name: true, color: true } },
      messages: {
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          from: true,
          to: true,
          subject: true,
          textBody: true,
          htmlBody: true,
          isRead: true,
          receivedAt: true,
          attachments: { select: { id: true, filename: true, storageUrl: true, key: true, mimeType: true, size: true } },
          threatScan: { select: { riskScore: true, findings: true } },
        },
      },
      mailbox: {
        select: {
          id: true,
          email: true,
          accessLogs: { where: { userId: user.id }, select: { userId: true }, take: 1 },
        },
      },
    },
  });

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const isAssigned = (thread.mailbox.accessLogs.length ?? 0) > 0;
  if (!isPrivileged && !isAssigned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(thread);
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await checkThreadAccess(id, user.id, user.role, user.email);
  if (!access) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  const body = (await request.json()) as {
    markRead?: boolean;
    isStarred?: boolean;
    isArchived?: boolean;
    isTrashed?: boolean;
    isSnoozed?: boolean;
    snoozedUntil?: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    folderId?: string | null;
    assignedToId?: string | null;
    slaDeadline?: string | null;
    internalNote?: string;
    acquireLock?: boolean;
    releaseLock?: boolean;
  };

  const updateData: Record<string, unknown> = {};

  if (body.markRead === true) {
    await prisma.inboxMessage.updateMany({ where: { threadId: id }, data: { isRead: true } });
    await invalidate(`unread:${user.id}`).catch(() => {});
  }
  if (body.markRead === false) {
    await prisma.inboxMessage.updateMany({ where: { threadId: id }, data: { isRead: false } });
    await invalidate(`unread:${user.id}`).catch(() => {});
  }
  if (body.isStarred !== undefined) updateData.isStarred = body.isStarred;
  if (body.isArchived !== undefined) updateData.isArchived = body.isArchived;
  if (body.isTrashed !== undefined) updateData.isTrashed = body.isTrashed;

  if (body.isSnoozed !== undefined) {
    updateData.isSnoozed = body.isSnoozed;
    updateData.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }
  if (body.priority) updateData.priority = body.priority;
  if ("folderId" in body) updateData.folderId = body.folderId ?? null;
  if ("assignedToId" in body) updateData.assignedToId = body.assignedToId ?? null;
  if ("slaDeadline" in body) updateData.slaDeadline = body.slaDeadline ? new Date(body.slaDeadline) : null;
  if (body.internalNote !== undefined) updateData.internalNote = body.internalNote;

  // Collision detection — lock/unlock for shared mailbox agents
  if (body.acquireLock) {
    const current = await prisma.inboxThread.findUnique({ where: { id }, select: { isLocked: true, lockedBy: true } });
    if (current?.isLocked && current.lockedBy !== user.id) {
      return NextResponse.json({ error: "Thread is locked by another agent", lockedBy: current.lockedBy }, { status: 409 });
    }
    updateData.isLocked = true;
    updateData.lockedBy = user.id;
    updateData.lockedAt = new Date();
  }
  if (body.releaseLock) {
    updateData.isLocked = false;
    updateData.lockedBy = null;
    updateData.lockedAt = null;
  }

  const updated = await prisma.inboxThread.update({ where: { id }, data: updateData });

  if (body.isArchived || body.isTrashed) {
    logAudit({ actorId: user.id, action: "THREAD_ARCHIVE", targetType: "InboxThread", targetId: id }).catch(() => {});
  }

  return NextResponse.json(updated);
}
