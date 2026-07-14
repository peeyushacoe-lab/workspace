import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const DOC_MARKER = "document";

const SELECT = { id: true, title: true, content: true, pinned: true, createdAt: true, updatedAt: true, userId: true } as const;

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const textFilter = q
    ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { content: { contains: q, mode: "insensitive" as const } }] }
    : {};

  const ownDocs = await prisma.note.findMany({
    where: { userId: user.id, color: DOC_MARKER, ...textFilter },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: SELECT,
  });

  // Docs shared with this user (not owned by them) — mirrors the pattern
  // already used by /api/sheets and /api/slides, which this route was
  // missing: without it, a doc granted via DocShareModal never appeared
  // anywhere in the recipient's UI (no "shared with me" list, no deep link).
  const sharedDocs: (typeof ownDocs[number] & { sharedRole: string })[] = [];
  try {
    const keys = await redis.keys("doc:share:doc:*");
    for (const key of keys) {
      const role = await redis.hget(key, user.id);
      if (!role) continue;
      const docId = key.replace("doc:share:doc:", "");
      const doc = await prisma.note.findFirst({ where: { id: docId, color: DOC_MARKER, ...textFilter }, select: SELECT });
      if (doc) sharedDocs.push({ ...doc, sharedRole: role });
    }
  } catch { /* Redis unavailable */ }

  const all = [
    ...ownDocs.map((d) => ({ ...d, isOwner: true, sharedRole: null as string | null })),
    ...sharedDocs.map((d) => ({ ...d, isOwner: false })),
  ];

  return NextResponse.json(all);
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
