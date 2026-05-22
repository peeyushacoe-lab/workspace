import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO"] as const;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all LEGAL_HOLD_PLACED entries
  const placedLogs = await prisma.auditLog.findMany({
    where: { action: "LEGAL_HOLD_PLACED" },
    orderBy: { createdAt: "asc" },
  });

  // Get all LEGAL_HOLD_RELEASED entries
  const releasedLogs = await prisma.auditLog.findMany({
    where: { action: "LEGAL_HOLD_RELEASED" },
    orderBy: { createdAt: "asc" },
  });

  // Build map: targetUserId -> latest released date
  const releasedMap = new Map<string, Date>();
  for (const log of releasedLogs) {
    const meta = log.metadata as Record<string, string> | null;
    const targetUserId = meta?.targetUserId ?? log.targetId;
    if (targetUserId) {
      const existing = releasedMap.get(targetUserId);
      if (!existing || log.createdAt > existing) {
        releasedMap.set(targetUserId, log.createdAt);
      }
    }
  }

  // Filter to active holds: placed after the last release (or never released)
  const activeHolds: {
    id: string;
    targetUserId: string;
    placedAt: string;
    placedBy: string;
    reason: string;
    status: "Active" | "Released";
  }[] = [];

  // Collect all unique targetUserIds with their latest placed log
  const latestPlaced = new Map<string, (typeof placedLogs)[number]>();
  for (const log of placedLogs) {
    const meta = log.metadata as Record<string, string> | null;
    const targetUserId = meta?.targetUserId ?? log.targetId;
    if (!targetUserId) continue;
    const existing = latestPlaced.get(targetUserId);
    if (!existing || log.createdAt > existing.createdAt) {
      latestPlaced.set(targetUserId, log);
    }
  }

  for (const [targetUserId, log] of latestPlaced.entries()) {
    const meta = log.metadata as Record<string, string> | null;
    const releasedAt = releasedMap.get(targetUserId);
    const isActive = !releasedAt || log.createdAt > releasedAt;

    activeHolds.push({
      id: log.id,
      targetUserId,
      placedAt: log.createdAt.toISOString(),
      placedBy: meta?.placedBy ?? log.actorId ?? "Unknown",
      reason: meta?.reason ?? "",
      status: isActive ? "Active" : "Released",
    });
  }

  // Fetch user details for all targetUserIds
  const userIds = activeHolds.map((h) => h.targetUserId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, fullName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const result = activeHolds.map((h) => ({
    ...h,
    userName: userMap.get(h.targetUserId)?.fullName ?? "Unknown",
    userEmail: userMap.get(h.targetUserId)?.email ?? "",
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, reason } = (await request.json()) as { userId: string; reason: string };
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  const log = await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "LEGAL_HOLD_PLACED",
      targetType: "User",
      targetId: userId,
      metadata: { targetUserId: userId, reason: reason.trim(), placedBy: user.fullName },
    },
  });

  return NextResponse.json({ success: true, logId: log.id });
}
