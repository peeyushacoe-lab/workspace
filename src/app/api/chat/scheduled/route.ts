import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceChatLimit } from "@/lib/chat/limits";

/**
 * Scheduled chat messages — write now, deliver later.
 *
 * GET  /api/chat/scheduled?channelId=… → this user's pending messages
 * POST /api/chat/scheduled             → schedule one
 *
 * Authorization is checked here *and* again in the worker at fire time, because
 * channel membership can change in the window between the two. See
 * src/workers/scheduled-chat-send.worker.ts.
 */

/** Furthest ahead a message can be scheduled. A year is generous; unbounded
 *  means rows that outlive the channel, the user and any memory of why. */
const MAX_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;
/** The poll runs every 60s, so anything under ~1 minute out is "send now" with
 *  extra steps and a worse latency guarantee. */
const MIN_LEAD_MS = 30_000;
/** Guards against a user turning the composer into a queue. */
const MAX_PENDING_PER_CHANNEL = 50;

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  const rows = await prisma.chatScheduledMessage.findMany({
    // Scoped to the caller — a scheduled message is private until it sends,
    // so channel membership is not enough to see someone else's.
    where: { userId: user.id, sentAt: null, ...(channelId ? { channelId } : {}) },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  const response = NextResponse.json(rows);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The per-channel cap below stops one conversation filling up; this stops
  // someone spreading the same flood across every conversation they're in.
  const limited = await enforceChatLimit("scheduled.create", user.id);
  if (limited) return limited;

  const body = (await request.json()) as {
    channelId?: string;
    content?: string;
    scheduledAt?: string;
    parentId?: string;
    quotedMessageId?: string;
    isUrgent?: boolean;
    attachmentUrl?: string;
    attachmentMime?: string;
    attachmentName?: string;
  };

  const { channelId, content, scheduledAt } = body;
  if (!channelId) return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  if (!content?.trim() && !body.attachmentUrl) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }
  if (content && content.length > 10_000) {
    return NextResponse.json({ error: "Message too long (max 10,000 characters)" }, { status: 400 });
  }

  const when = scheduledAt ? new Date(scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "A valid scheduledAt time is required" }, { status: 400 });
  }
  const delta = when.getTime() - Date.now();
  if (delta < MIN_LEAD_MS) {
    return NextResponse.json({ error: "Pick a time at least a minute from now" }, { status: 400 });
  }
  if (delta > MAX_HORIZON_MS) {
    return NextResponse.json({ error: "Messages can't be scheduled more than a year ahead" }, { status: 400 });
  }

  const [membership, channel, pending] = await Promise.all([
    prisma.chatMember.findUnique({
      where: { channelId_userId: { channelId, userId: user.id } },
      select: { role: true },
    }),
    prisma.chatChannel.findUnique({ where: { id: channelId }, select: { isBroadcast: true } }),
    prisma.chatScheduledMessage.count({ where: { userId: user.id, channelId, sentAt: null, failedAt: null } }),
  ]);

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (channel?.isBroadcast && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Only the channel owner can post in a broadcast channel" }, { status: 403 });
  }
  if (pending >= MAX_PENDING_PER_CHANNEL) {
    return NextResponse.json(
      { error: `You already have ${MAX_PENDING_PER_CHANNEL} messages scheduled here` },
      { status: 429 },
    );
  }

  const created = await prisma.chatScheduledMessage.create({
    data: {
      channelId,
      userId: user.id,
      content: content?.trim() ?? "",
      scheduledAt: when,
      parentId: body.parentId ?? null,
      quotedMessageId: body.quotedMessageId ?? null,
      isUrgent: body.isUrgent === true,
      attachmentUrl: body.attachmentUrl ?? null,
      attachmentMime: body.attachmentMime ?? null,
      attachmentName: body.attachmentName ?? null,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
