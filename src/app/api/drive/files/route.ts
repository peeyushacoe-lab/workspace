import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  // Use || null so empty string "" (from ?folderId=) collapses to null (root)
  const folderId = searchParams.get("folderId") || null;
  const starred = searchParams.get("starred") === "true";
  const trashed = searchParams.get("trashed") === "true";
  const query = searchParams.get("q") ?? "";
  // ?all=true — return files across ALL folders (used by recent view)
  const all = searchParams.get("all") === "true";

  const files = await prisma.driveFile.findMany({
    where: {
      ownerId: user.id,
      isTrashed: trashed,
      ...(starred ? { isStarred: true } : {}),
      ...(query
        ? { name: { contains: query, mode: "insensitive" } }
        : all
          ? {}
          : { folderId }),
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(files.map((f) => ({ ...f, size: f.size.toString() })));
}
