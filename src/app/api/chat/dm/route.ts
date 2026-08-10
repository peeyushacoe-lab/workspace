import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore, canAccessPath } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/chat/dm — find-or-create the direct conversation with one person.
 *
 * Needed because `POST /api/chat/channels` has no idea a DIRECT channel between
 * two people should be unique: calling it twice produces two parallel DMs with
 * the same colleague, each holding half the history. Any "Message this person"
 * button — the People profile is the first — has to go through a find-or-create
 * or it quietly forks conversations.
 *
 * Returns `{ channelId, created }` so the caller can deep-link straight to
 * `/connect/chat?channel=<id>`.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Messaging is gated at /connect — the HR account is excluded there, so it must
  // not be able to open a DM through this side door either.
  if (!canAccessPath(user, "/connect")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const targetId = body.userId?.trim();
  if (!targetId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (targetId === user.id) {
    return NextResponse.json({ error: "Cannot start a conversation with yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, fullName: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  // An existing DM is one where BOTH are members. The `members: { every: ... }`
  // clause is what makes it exact: without it, a group chat that happens to
  // contain both people would match and the "DM" would open a group thread.
  const existing = await prisma.chatChannel.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { members: { some: { userId: user.id } } },
        { members: { some: { userId: targetId } } },
        { members: { every: { userId: { in: [user.id, targetId] } } } },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ channelId: existing.id, created: false });
  }

  // The name is a fallback label only — ChatView renders a DM using the other
  // member's profile, not this string, so it never shows "you and them".
  const channel = await prisma.chatChannel.create({
    data: {
      name: target.fullName,
      type: "DIRECT",
      isPrivate: true,
      createdById: user.id,
      members: {
        create: [
          { userId: user.id, role: "ADMIN" },
          { userId: targetId, role: "ADMIN" },
        ],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ channelId: channel.id, created: true }, { status: 201 });
}
