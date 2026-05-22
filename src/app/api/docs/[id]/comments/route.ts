import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: documentId } = await params;

  const comments = await prisma.docComment.findMany({
    where: { documentId, parentId: null },
    include: {
      replies: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Hydrate user names from IDs
  const userIds = [...new Set([...comments.map((c) => c.userId), ...comments.flatMap((c) => c.replies.map((r) => r.userId))])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, avatarUrl: true } });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const hydrated = comments.map((c) => ({
    ...c,
    user: userMap[c.userId],
    replies: c.replies.map((r) => ({ ...r, user: userMap[r.userId] })),
  }));

  return NextResponse.json(hydrated);
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: documentId } = await params;

  const body = await request.json() as {
    content: string;
    range?: { from: number; to: number };
    parentId?: string;
  };

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const comment = await prisma.docComment.create({
    data: {
      documentId,
      userId: user.id,
      content: body.content.trim(),
      range: (body.range ?? undefined) as never,
      parentId: body.parentId ?? null,
    },
  });

  return NextResponse.json({ ...comment, user: { id: user.id, fullName: user.fullName } }, { status: 201 });
}
