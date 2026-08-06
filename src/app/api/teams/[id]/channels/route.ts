import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { enforceChatLimit } from "@/lib/chat/limits";

// ─── Team channel list ────────────────────────────────────────────────────────
// The piece RFC-003 called "build pending": ChatChannel.teamId has existed in
// the schema since the last migration, but nothing read or wrote it. This is
// that read/write path — see docs/rfc-003-teams-and-channels.md.
//
// A team with no channels is a list of people with no place to work, so GET
// bootstraps a "general" channel the first time anyone opens a team that
// doesn't have one yet, seeded with the team's current roster. This mirrors
// how a brand-new org gets its first org-wide channel — nobody should have to
// find a separate "create channel" button before a team is usable.

type Params = { params: Promise<{ id: string }> };

async function resolveTeam(id: string, organizationId: string | null | undefined) {
  return prisma.team.findFirst({
    where: {
      ...(organizationId ? { organizationId } : {}),
      OR: [{ id }, { slug: id }],
    },
    include: { members: { select: { userId: true } } },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const team = await resolveTeam(id, currentUser.organizationId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const isMember = team.members.some((m) => m.userId === currentUser.id);
  if (!isMember && currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let channels = await prisma.chatChannel.findMany({
    where: { teamId: team.id },
    orderBy: { position: "asc" },
    include: { members: { select: { userId: true, role: true } } },
  });

  if (channels.length === 0) {
    // First visit to a team with no channels yet — create its General channel
    // and join every current team member to it in one shot, rather than
    // leaving the requester to stumble on an empty state with no obvious next
    // step. Re-checked with a transaction-free create: a duplicate "general"
    // from a race is a cosmetic problem (two channels named the same), not a
    // correctness one, and locking here for a once-per-team event isn't worth it.
    const general = await prisma.chatChannel.create({
      data: {
        name: "general",
        description: `${team.name} team channel`,
        type: "CHANNEL",
        isPrivate: false,
        createdById: currentUser.id,
        teamId: team.id,
        position: 0,
        members: {
          create: team.members.map((m) => ({
            userId: m.userId,
            role: m.userId === currentUser.id ? "ADMIN" : "MEMBER",
          })),
        },
      },
      include: { members: { select: { userId: true, role: true } } },
    });
    channels = [general];
  }

  return NextResponse.json(
    channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      type: c.type,
      isPrivate: c.isPrivate,
      isBroadcast: c.isBroadcast,
      position: c.position,
      memberCount: c.members.length,
    })),
  );
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  isPrivate: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Shares the channel-create budget with /api/chat/channels — the limit is on
  // the act of creating a conversation, not on which route you used to do it.
  const limited = await enforceChatLimit("channel.create", currentUser.id);
  if (limited) return limited;

  const { id } = await params;
  const team = await resolveTeam(id, currentUser.organizationId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const isMember = team.members.some((m) => m.userId === currentUser.id);
  if (!isMember && currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const existingPositions = await prisma.chatChannel.findMany({
    where: { teamId: team.id },
    select: { position: true },
  });
  const position = existingPositions.length
    ? Math.max(...existingPositions.map((c) => c.position)) + 1
    : 0;

  // Non-private: whole team joins, same rule as the General bootstrap above.
  // Private: only the creator and whoever was explicitly named.
  const memberIds = body.isPrivate
    ? Array.from(new Set([currentUser.id, ...(body.memberIds ?? [])]))
    : Array.from(new Set([currentUser.id, ...team.members.map((m) => m.userId), ...(body.memberIds ?? [])]));

  const channel = await prisma.chatChannel.create({
    data: {
      name: body.name.trim(),
      description: body.description,
      type: "CHANNEL",
      isPrivate: body.isPrivate ?? false,
      createdById: currentUser.id,
      teamId: team.id,
      position,
      members: {
        create: memberIds.map((uid) => ({
          userId: uid,
          role: uid === currentUser.id ? "ADMIN" : "MEMBER",
        })),
      },
    },
    include: { members: { select: { userId: true, role: true } } },
  });

  return NextResponse.json(channel, { status: 201 });
}
