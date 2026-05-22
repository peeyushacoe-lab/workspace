import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const node = await prisma.knowledgeNode.findFirst({ where: { id, userId: user.id } });
  if (!node) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.knowledgeNode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const node = await prisma.knowledgeNode.findFirst({ where: { id, OR: [{ userId: user.id }, { isPublic: true }] } });
  if (!node) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json() as { label?: string; content?: string; properties?: Record<string, unknown>; isPublic?: boolean };
  const updated = await prisma.knowledgeNode.update({
    where: { id },
    data: {
      ...(body.label && { label: body.label }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.properties && { properties: body.properties as never }),
      ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
    },
  });
  return NextResponse.json(updated);
}
