import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { upsertEmbedding } from "@/lib/embeddings";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") ?? undefined;
  const q = searchParams.get("q") ?? "";

  const items = await prisma.workspaceKnowledge.findMany({
    where: {
      OR: [{ userId: user.id }, { isPublic: true }],
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, content: true, source: true, category: true, tags: true, isPublic: true, viewCount: true, userId: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    source?: string;
  };

  if (!body.title || !body.content) {
    return NextResponse.json({ error: "title and content required" }, { status: 400 });
  }

  const item = await prisma.workspaceKnowledge.create({
    data: {
      title: body.title,
      content: body.content,
      source: body.source ?? "manual",
      category: body.category ?? null,
      tags: body.tags ?? [],
      isPublic: body.isPublic ?? false,
      userId: user.id,
      embedding: [],
    },
  });

  // Generate embedding in background
  upsertEmbedding({
    resourceType: "knowledge",
    resourceId: item.id,
    content: `${body.title}\n\n${body.content}`,
    userId: user.id,
  }).then(() =>
    prisma.workspaceKnowledge.update({ where: { id: item.id }, data: {} })
  ).catch(() => {});

  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = await prisma.workspaceKnowledge.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workspaceKnowledge.delete({ where: { id } });
  await prisma.documentEmbedding.deleteMany({ where: { resourceType: "knowledge", resourceId: id } });

  return NextResponse.json({ ok: true });
}
