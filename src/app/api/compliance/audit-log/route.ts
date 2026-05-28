/**
 * Audit Log Viewer — Phase 27 Compliance
 * GET  ?page=&limit=&actorId=&action=&from=&to=
 * Admin/CISO only
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = new Set(["ADMIN", "CISO"]);

export async function GET(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
  const actorId = searchParams.get("actorId") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  const where = {
    ...(actorId && { actorId }),
    ...(action && { action: { contains: action, mode: "insensitive" as const } }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Enrich with actor names in a second query
  const actorIds = [...new Set(logs.map(l => l.actorId).filter(Boolean) as string[])];
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, fullName: true },
      })
    : [];
  const actorMap = Object.fromEntries(actors.map(a => [a.id, a]));

  const enriched = logs.map(l => ({
    ...l,
    actor: l.actorId ? (actorMap[l.actorId] ?? null) : null,
  }));

  return NextResponse.json({ logs: enriched, total, page, pages: Math.ceil(total / limit) });
}
