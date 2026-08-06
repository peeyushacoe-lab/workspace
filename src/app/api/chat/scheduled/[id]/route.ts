import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deliverChatMessage } from "@/lib/chat/deliver";

/**
 * A single pending scheduled message.
 *
 * PATCH  → edit the text, move the time, or `sendNow: true` to fire immediately
 * DELETE → cancel it
 *
 * Ownership, not channel membership, is the check: only the author can touch
 * their own unsent message. A row that has already sent is immutable — the
 * ChatMessage it became is the thing to edit at that point.
 */

type Params = { params: Promise<{ id: string }> };

const MAX_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_LEAD_MS = 30_000;

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.chatScheduledMessage.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    // Same response for "not yours" and "doesn't exist" — an attacker shouldn't
    // be able to enumerate other people's scheduled message ids.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.sentAt) {
    return NextResponse.json({ error: "That message has already been sent" }, { status: 409 });
  }

  const body = (await request.json()) as {
    content?: string;
    scheduledAt?: string;
    sendNow?: boolean;
  };

  // "Send now" — deliver through the same helper the worker uses, then close
  // the row out as sent so the poll never picks it up again.
  if (body.sendNow) {
    const membership = await prisma.chatMember.findUnique({
      where: { channelId_userId: { channelId: existing.channelId, userId: user.id } },
      select: { role: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const message = await deliverChatMessage(
      { id: user.id, fullName: user.fullName },
      {
        channelId: existing.channelId,
        content: existing.content,
        parentId: existing.parentId,
        quotedMessageId: existing.quotedMessageId,
        isUrgent: existing.isUrgent,
        attachmentUrl: existing.attachmentUrl,
        attachmentMime: existing.attachmentMime,
        attachmentName: existing.attachmentName,
      },
    );
    await prisma.chatScheduledMessage.update({
      where: { id },
      data: { sentAt: new Date(), failedAt: null, failureReason: null },
    });
    return NextResponse.json({ sent: true, message });
  }

  const data: { content?: string; scheduledAt?: Date; failedAt?: null; failureReason?: null } = {};

  if (body.content !== undefined) {
    if (!body.content.trim() && !existing.attachmentUrl) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }
    if (body.content.length > 10_000) {
      return NextResponse.json({ error: "Message too long (max 10,000 characters)" }, { status: 400 });
    }
    data.content = body.content.trim();
  }

  if (body.scheduledAt !== undefined) {
    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "A valid scheduledAt time is required" }, { status: 400 });
    }
    const delta = when.getTime() - Date.now();
    if (delta < MIN_LEAD_MS) {
      return NextResponse.json({ error: "Pick a time at least a minute from now" }, { status: 400 });
    }
    if (delta > MAX_HORIZON_MS) {
      return NextResponse.json({ error: "Messages can't be scheduled more than a year ahead" }, { status: 400 });
    }
    data.scheduledAt = when;
    // Rescheduling a message that failed is the natural way to retry it.
    data.failedAt = null;
    data.failureReason = null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.chatScheduledMessage.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.chatScheduledMessage.findUnique({
    where: { id },
    select: { userId: true, sentAt: true },
  });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.sentAt) {
    return NextResponse.json({ error: "That message has already been sent" }, { status: 409 });
  }

  await prisma.chatScheduledMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
