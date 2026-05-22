import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DOC_MARKER = "document";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const docs = await prisma.note.findMany({
    where: {
      userId: user.id,
      color: DOC_MARKER,
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, content: true, pinned: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(docs);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { title?: string; content?: string };

  const doc = await prisma.note.create({
    data: {
      title: body.title?.trim() || "Untitled Document",
      content: body.content ?? "",
      color: DOC_MARKER,
      userId: user.id,
    },
  });

  return NextResponse.json(doc, { status: 201 });
}
