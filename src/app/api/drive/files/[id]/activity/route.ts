import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const DRIVE_ACTIONS = new Set([
  "DRIVE_FILE_VIEW",
  "DRIVE_FILE_DOWNLOAD",
  "DRIVE_FILE_UPLOAD",
  "DRIVE_FILE_SHARE",
  "DRIVE_FILE_EDIT",
  "DRIVE_FILE_DELETE",
  "DRIVE_FILE_RESTORE",
]);

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get audit logs for this file
  const logs = await prisma.auditLog.findMany({
    where: {
      targetType: "DriveFile",
      targetId: id,
      action: { in: [...DRIVE_ACTIONS] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Enrich with actor info
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, fullName: true, email: true },
  });
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const enriched = logs.map((l) => ({
    id: l.id,
    action: l.action,
    actorId: l.actorId,
    actorName: l.actorId ? (actorMap.get(l.actorId)?.fullName ?? "Unknown") : "System",
    actorEmail: l.actorId ? (actorMap.get(l.actorId)?.email ?? "") : "",
    metadata: l.metadata,
    createdAt: l.createdAt,
  }));

  return NextResponse.json(enriched);
}
