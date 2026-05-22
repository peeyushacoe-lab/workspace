import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await prisma.driveFileVersion.findMany({
    where: { fileId: id },
    orderBy: { versionNum: "desc" },
  });

  // Enrich with uploader info
  const userIds = [...new Set(versions.map((v) => v.uploadedBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, fullName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enriched = versions.map((v) => ({
    id: v.id,
    versionNum: v.versionNum,
    storageKey: v.storageKey,
    size: v.size.toString(),
    uploadedBy: v.uploadedBy,
    uploaderName: userMap.get(v.uploadedBy)?.fullName ?? "Unknown",
    createdAt: v.createdAt,
    isCurrent: v.storageKey === file.storageKey,
  }));

  return NextResponse.json(enriched);
}
