import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

  const [files, folders] = await Promise.all([
    prisma.driveFile.findMany({
      where: { ownerId: user.userId, isTrashed: false, folderId: folderId ?? null },
      select: { id: true, name: true, mimeType: true, size: true, storageUrl: true, createdAt: true, updatedAt: true, isStarred: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    prisma.driveFolder.findMany({
      where: { ownerId: user.userId, parentId: folderId ?? null },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ files, folders });
}
