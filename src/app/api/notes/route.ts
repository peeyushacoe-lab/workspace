import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const notes = await prisma.note.findMany({
    where: {
      userId: user.id,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      color: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    content?: string;
    color?: string;
  };

  const note = await prisma.note.create({
    data: {
      title: body.title?.trim() || "Untitled Note",
      content: body.content ?? "",
      color: body.color ?? null,
      userId: user.id,
    },
  });

  return NextResponse.json(note, { status: 201 });
}
