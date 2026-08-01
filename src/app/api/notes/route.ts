import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { indexingQueue } from "@/lib/queues/indexing.queue";
import { normaliseTags } from "@/lib/note-tags";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  // Repeatable ?tag= — a note must carry ALL requested tags (AND), which is
  // what people expect when they stack filters.
  const tags = searchParams.getAll("tag").map(t => t.trim()).filter(Boolean);

  const notes = await prisma.note.findMany({
    where: {
      userId: user.id,
      ...(tags.length ? { tags: { hasEvery: tags } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
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
      folder: true,
      tags: true,
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
    folder?: string | null;
    tags?: string[];
  };

  const note = await prisma.note.create({
    data: {
      title: body.title?.trim() || "Untitled Note",
      content: body.content ?? "",
      color: body.color ?? null,
      folder: body.folder ?? null,
      tags: normaliseTags(body.tags),
      userId: user.id,
    },
  });

  indexingQueue.add("index-note", {
    type: "INDEX",
    resource: "note",
    resourceId: note.id,
    content: `${note.title} ${note.content}`,
    metadata: { ownerId: user.id, title: note.title, updatedAt: note.updatedAt.toISOString() },
  }).catch(() => {});

  return NextResponse.json(note, { status: 201 });
}
