import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const files = await prisma.driveFile.findMany({
    where: { ownerId: user.id, isTrashed: false },
    select: { size: true, mimeType: true },
  });

  const totalBytes = files.reduce((sum, f) => sum + Number(f.size), 0);
  const fileCount = files.length;

  const byType: Record<string, number> = {};
  for (const f of files) {
    const category = f.mimeType.split("/")[0];
    byType[category] = (byType[category] ?? 0) + Number(f.size);
  }

  return NextResponse.json({
    totalBytes,
    totalMB: Math.round(totalBytes / 1024 / 1024),
    fileCount,
    byType,
    limitBytes: 15 * 1024 * 1024 * 1024, // 15 GB (like Google Drive free)
    usagePercent: Math.round((totalBytes / (15 * 1024 * 1024 * 1024)) * 100),
  });
}
