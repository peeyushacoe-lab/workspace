import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId") ?? null;

  const folders = await prisma.driveFolder.findMany({
    where: {
      ownerId: user.id,
      parentId: parentId ?? null,
    },
    include: {
      _count: { select: { children: true, files: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(folders);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, parentId } = (await request.json()) as {
    name: string;
    parentId?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  const folder = await prisma.driveFolder.create({
    data: { name: name.trim(), parentId: parentId ?? null, ownerId: user.id },
    include: { _count: { select: { children: true, files: true } } },
  });

  return NextResponse.json(folder, { status: 201 });
}
