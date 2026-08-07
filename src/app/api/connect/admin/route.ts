import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/can";
import { prisma } from "@/lib/prisma";
import { readPolicies, writePolicies, clampPolicyNumber, type ConnectPolicies, type DeepPartial } from "@/lib/connect-policies";
import { logAudit } from "@/lib/audit";
import { SYSTEM_ROLES } from "@/lib/rbac/system-roles";

/**
 * Connect Admin — the read side.
 *
 * One route with a `view` parameter rather than four sibling routes, because
 * every view shares the same permission gate, the same org scoping and the
 * same "an admin is looking at data that isn't theirs" contract. Splitting
 * them would mean writing that contract four times and getting it subtly
 * different in one of them.
 *
 *   ?view=overview  workspace-wide counts for the console header
 *   ?view=members   everyone, with their Connect activity
 *   ?view=channels  every conversation, including ones the admin isn't in
 *   ?view=audit     the audit trail
 *
 * Note what this deliberately does NOT expose: message *content*. An admin can
 * see that a channel exists, how many messages it holds and who is in it, but
 * reading them is an eDiscovery action that belongs behind a legal hold and
 * its own audit trail — not behind a tab anyone with `org.manage` can browse.
 */

export async function GET(request: Request) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "overview";
  const q = (searchParams.get("q") ?? "").trim();
  const orgId = auth.user.organizationId ?? undefined;

  try {
    switch (view) {
      case "overview":
        return NextResponse.json(await overview(orgId));
      case "members":
        return NextResponse.json(await members(orgId, q));
      case "channels":
        return NextResponse.json(await channels(q));
      case "audit":
        return NextResponse.json(await audit(q, searchParams.get("action")));
      case "organisation":
        return NextResponse.json(await organisation(orgId));
      case "teams":
        return NextResponse.json(await teams(orgId, q));
      case "roles":
        return NextResponse.json(await roles(orgId));
      case "policies":
        return NextResponse.json(await policies(orgId));
      case "security":
        return NextResponse.json(await security(orgId));
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (err) {
    console.error("[connect/admin]", view, err);
    return NextResponse.json({ error: "Could not load that view" }, { status: 500 });
  }
}

async function overview(orgId: string | undefined) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalMembers,
    activeMembers,
    totalChannels,
    privateChannels,
    teams,
    messages24h,
    messages7d,
    // "Active" is people who actually said something, not people with an
    // account. In a pilot the gap between those two numbers is the finding.
    activeSenders7d,
    scheduledPending,
  ] = await Promise.all([
    prisma.user.count({ where: orgId ? { organizationId: orgId } : {} }),
    prisma.user.count({ where: { isActive: true, ...(orgId ? { organizationId: orgId } : {}) } }),
    prisma.chatChannel.count(),
    prisma.chatChannel.count({ where: { isPrivate: true } }),
    prisma.team.count({ where: orgId ? { organizationId: orgId } : {} }),
    prisma.chatMessage.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null } }),
    prisma.chatMessage.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
    prisma.chatMessage
      .findMany({
        where: { createdAt: { gte: weekAgo }, deletedAt: null },
        select: { userId: true },
        distinct: ["userId"],
      })
      .then((r) => r.length),
    prisma.chatScheduledMessage.count({ where: { sentAt: null, failedAt: null } }).catch(() => 0),
  ]);

  return {
    totalMembers,
    activeMembers,
    deactivatedMembers: totalMembers - activeMembers,
    totalChannels,
    privateChannels,
    teams,
    messages24h,
    messages7d,
    activeSenders7d,
    scheduledPending,
  };
}

async function members(orgId: string | undefined, q: string) {
  const users = await prisma.user.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { chatMemberships: true, teamMemberships: true } },
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    take: 200,
  });

  // Last activity in Connect specifically — a workspace-wide "last seen" would
  // count someone reading email in Nexus as being active here, which is the
  // number an admin would then act on when deciding who's actually using it.
  const lastMessages = await prisma.$queryRaw<{ userId: string; at: Date }[]>`
    SELECT "userId" AS "userId", MAX("createdAt") AS at
    FROM "ChatMessage"
    GROUP BY "userId"
  `.catch(() => []);
  const lastByUser = new Map(lastMessages.map((r) => [r.userId, r.at]));

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    channels: u._count.chatMemberships,
    teams: u._count.teamMemberships,
    lastMessageAt: lastByUser.get(u.id) ?? null,
  }));
}

async function channels(q: string) {
  const rows = await prisma.chatChannel.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    select: {
      id: true,
      name: true,
      type: true,
      isPrivate: true,
      isBroadcast: true,
      teamId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { members: true, messages: true } },
      team: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    isPrivate: c.isPrivate,
    isBroadcast: c.isBroadcast,
    teamName: c.team?.name ?? null,
    members: c._count.members,
    messages: c._count.messages,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

async function audit(q: string, action: string | null) {
  const rows = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { targetId: q }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // AuditLog.actorId has no foreign key on purpose — the trail has to survive
  // the deletion of the person it describes. That means the name has to be
  // resolved separately, and an actor who no longer exists is a normal result,
  // not an error.
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const nameById = new Map(actors.map((a) => [a.id, a.fullName]));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actorId,
    actorName: r.actorId ? (nameById.get(r.actorId) ?? "Deleted user") : "System",
    targetType: r.targetType,
    targetId: r.targetId,
    ipAddress: r.ipAddress,
    metadata: r.metadata,
    createdAt: r.createdAt,
  }));
}

// ── Organisation ─────────────────────────────────────────────────────────────

async function organisation(orgId: string | undefined) {
  if (!orgId) return { org: null };
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true, name: true, slug: true, domain: true, plan: true,
      maxUsers: true, isActive: true, createdAt: true,
      _count: { select: { users: true, teams: true, departments: true, channels: true } },
    },
  });
  return { org };
}

async function teams(orgId: string | undefined, q: string) {
  const rows = await prisma.team.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true, name: true, slug: true, icon: true, color: true, createdAt: true,
      _count: { select: { members: true, channels: true } },
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  return rows.map((t) => ({
    id: t.id, name: t.name, slug: t.slug, color: t.color,
    department: t.department?.name ?? null,
    members: t._count.members,
    channels: t._count.channels,
    createdAt: t.createdAt,
  }));
}

/**
 * Who holds what. Read-only here on purpose — editing roles already lives at
 * /org, and a second editor for the same data is how the two drift apart.
 * What this adds is the answer to "who can actually administer Connect", which
 * is the question an auditor asks and which no existing screen answered.
 */
async function roles(orgId: string | undefined) {
  const assignments = await prisma.role.findMany({
    where: orgId ? { OR: [{ organizationId: orgId }, { isSystem: true }] } : {},
    select: {
      id: true, name: true, isSystem: true,
      _count: { select: { assignments: true } },
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  }).catch(() => [] as { id: string; name: string; isSystem: boolean; _count: { assignments: number } }[]);

  // The enum-role side of the story, which is what actually gates most of the
  // app today while RBAC_ENFORCE is still off.
  const byEnumRole = await prisma.user.groupBy({
    by: ["role"],
    where: { isActive: true, ...(orgId ? { organizationId: orgId } : {}) },
    _count: { role: true },
  }).catch(() => [] as { role: string; _count: { role: number } }[]);

  const adminCapable = SYSTEM_ROLES
    .filter((r) => r.isSuper || r.permissions.includes("org.manage"))
    .map((r) => r.enumValue);

  return {
    roles: assignments.map((r) => ({
      id: r.id, name: r.name, isSystem: r.isSystem, holders: r._count.assignments,
    })),
    enumRoles: byEnumRole.map((r) => ({
      role: r.role,
      people: r._count.role,
      canAdministerConnect: adminCapable.includes(r.role as (typeof adminCapable)[number]),
    })),
  };
}

async function policies(orgId: string | undefined) {
  if (!orgId) return { policies: readPolicies(null), orgless: true };
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  return { policies: readPolicies(org?.settings), orgless: false };
}

/**
 * Security posture — the questions someone asks after an incident, answered
 * from data rather than from a checklist someone ticked once.
 */
async function security(orgId: string | undefined) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scope = orgId ? { organizationId: orgId } : {};

  const [activeSessions, deactivated, mfaOn, totalActive, holds, recentAdminActions, privateChannels, broadcastChannels] =
    await Promise.all([
      prisma.userSession.count({ where: { expiresAt: { gt: new Date() } } }).catch(() => 0),
      prisma.user.count({ where: { isActive: false, ...scope } }),
      prisma.user.count({ where: { mfaEnabled: true, isActive: true, ...scope } }).catch(() => 0),
      prisma.user.count({ where: { isActive: true, ...scope } }),
      prisma.legalHold.count({ where: { isActive: true } }).catch(() => 0),
      prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } }).catch(() => 0),
      prisma.chatChannel.count({ where: { isPrivate: true } }),
      prisma.chatChannel.count({ where: { isBroadcast: true } }),
    ]);

  return {
    activeSessions,
    deactivated,
    mfaOn,
    totalActive,
    legalHolds: holds,
    adminActions7d: recentAdminActions,
    privateChannels,
    broadcastChannels,
    rbacEnforced: process.env.RBAC_ENFORCE === "true",
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Policy changes. Numeric values are clamped rather than rejected, so a typo
 * can't persist a limit that locks the whole workspace out of sending.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiPermission("org.manage");
  if ("error" in auth) return auth.error;

  const orgId = auth.user.organizationId;
  if (!orgId) {
    return NextResponse.json(
      { error: "This account isn't attached to an organisation, so there's nothing to configure." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { policies?: DeepPartial<ConnectPolicies> }
    | null;
  if (!body?.policies) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const p = body.policies;
  const patch: DeepPartial<ConnectPolicies> = {};

  if (p.messaging) {
    patch.messaging = {
      ...(typeof p.messaging.maxMessageLength === "number"
        ? { maxMessageLength: clampPolicyNumber("maxMessageLength", p.messaging.maxMessageLength) }
        : {}),
      ...(typeof p.messaging.allowAttachments === "boolean" ? { allowAttachments: p.messaging.allowAttachments } : {}),
      ...(typeof p.messaging.allowEditing === "boolean" ? { allowEditing: p.messaging.allowEditing } : {}),
      ...(typeof p.messaging.allowDeleting === "boolean" ? { allowDeleting: p.messaging.allowDeleting } : {}),
      ...(typeof p.messaging.allowUrgent === "boolean" ? { allowUrgent: p.messaging.allowUrgent } : {}),
    };
  }
  if (p.files && typeof p.files.maxUploadMb === "number") {
    patch.files = { maxUploadMb: clampPolicyNumber("maxUploadMb", p.files.maxUploadMb) };
  }
  if (p.retention && typeof p.retention.messageRetentionDays === "number") {
    patch.retention = {
      messageRetentionDays: clampPolicyNumber("messageRetentionDays", p.retention.messageRetentionDays),
    };
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  const next = writePolicies(org?.settings, patch);
  await prisma.organization.update({ where: { id: orgId }, data: { settings: next as object } });

  // Retention is destructive and delayed — whoever set the window needs to be
  // on the record, because the deletions happen at 03:00 with no other trace.
  await logAudit({
    actorId: auth.user.id,
    action: "CONNECT_POLICY_UPDATED",
    targetType: "Organization",
    targetId: orgId,
    metadata: patch as never,
  });

  return NextResponse.json({ policies: readPolicies(next) });
}
