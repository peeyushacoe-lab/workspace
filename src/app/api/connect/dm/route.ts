import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ─── Find-or-create a direct message ──────────────────────────────────────────
// "Message this person" needs a channel id before it can navigate anywhere, and
// the answer is either an existing DM or a new one. ChatView already does this
// dedup client-side inside its new-conversation dialog, but only against the
// channels it has already loaded — Connect needs it from a plain link, without
// the dialog, so the check has to happen server-side against the database.
//
// POST /api/connect/dm { userId } → { channelId, created }

export const dynamic = "force-dynamic";

export type ConnectDmResponse = { channelId: string; created: boolean };

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const targetId = body.userId?.trim();
  if (!targetId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (targetId === currentUser.id) {
    return NextResponse.json({ error: "Cannot open a DM with yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, fullName: true, isActive: true, organizationId: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Same-organisation only. Without this, a guessed id would open a channel
  // across tenants — and a channel, once created, is permanent.
  if (currentUser.organizationId && target.organizationId !== currentUser.organizationId) {
    return NextResponse.json({ error: "User is not in this organisation" }, { status: 403 });
  }

  // An existing DM is any DIRECT channel both people are in. The `every` guard
  // is what stops a GROUP-shaped conversation that happens to be typed DIRECT
  // from matching — a DM has exactly these two members and nobody else.
  const existing = await prisma.chatChannel.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { members: { some: { userId: currentUser.id } } },
        { members: { some: { userId: target.id } } },
        { members: { every: { userId: { in: [currentUser.id, target.id] } } } },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ channelId: existing.id, created: false } satisfies ConnectDmResponse);
  }

  // Naming matches ChatView's dialog: a DM is titled with the other person, and
  // the sidebar substitutes the counterpart's name when it renders one anyway.
  const channel = await prisma.chatChannel.create({
    data: {
      name: target.fullName,
      type: "DIRECT",
      isPrivate: true,
      createdById: currentUser.id,
      organizationId: currentUser.organizationId ?? null,
      members: {
        create: [
          { userId: currentUser.id, role: "ADMIN" },
          { userId: target.id, role: "MEMBER" },
        ],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ channelId: channel.id, created: true } satisfies ConnectDmResponse);
}
