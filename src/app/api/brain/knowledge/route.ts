import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? undefined;
  const q = searchParams.get("q") ?? "";

  const nodes = await prisma.knowledgeNode.findMany({
    where: {
      OR: [{ userId: user.id }, { isPublic: true }],
      ...(type ? { type } : {}),
      ...(q ? { label: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      sourceEdges: { include: { target: { select: { id: true, label: true, type: true } } } },
      targetEdges: { include: { source: { select: { id: true, label: true, type: true } } } },
    },
    take: 100,
  });

  return NextResponse.json(nodes);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    label: string;
    type: string;
    content?: string;
    properties?: Record<string, unknown>;
    isPublic?: boolean;
    edges?: Array<{ targetId?: string; sourceId?: string; relationship: string; weight?: number }>;
  };

  if (!body.label || !body.type) {
    return NextResponse.json({ error: "label and type required" }, { status: 400 });
  }

  const node = await prisma.knowledgeNode.create({
    data: {
      label: body.label,
      type: body.type,
      content: body.content ?? null,
      properties: (body.properties ?? undefined) as never,
      isPublic: body.isPublic ?? false,
      userId: user.id,
      embedding: [],
    },
  });

  // Create edges if provided
  if (body.edges?.length) {
    await prisma.knowledgeEdge.createMany({
      data: body.edges.map((e) => ({
        sourceId: e.sourceId ?? node.id,
        targetId: e.targetId ?? node.id,
        relationship: e.relationship,
        weight: e.weight ?? 1.0,
      })),
      skipDuplicates: true,
    });
  }

  // Embed asynchronously
  if (body.content) {
    import("@/lib/embeddings").then(({ embed }) =>
      embed(`${body.label} ${body.content}`).then((vec) =>
        prisma.knowledgeNode.update({ where: { id: node.id }, data: { embedding: vec } })
      )
    ).catch(() => {});
  }

  return NextResponse.json(node, { status: 201 });
}
