import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = await prisma.mailFolder.findMany({
    where: { userId: user.id },
    // Only count mails actually still in the folder — exclude trashed threads
    // (deleting a mail flags isTrashed but keeps it linked to the folder).
    include: { _count: { select: { threads: { where: { isTrashed: false } } } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(folders);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string; color?: string; icon?: string; mailboxId?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const existing = await prisma.mailFolder.findFirst({
    where: { userId: user.id, name: body.name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: "A folder with this name already exists" }, { status: 409 });
  }

  const folder = await prisma.mailFolder.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      color: body.color ?? null,
      icon: body.icon ?? null,
      mailboxId: body.mailboxId ?? null,
    },
  });

  return NextResponse.json(folder, { status: 201 });
}
