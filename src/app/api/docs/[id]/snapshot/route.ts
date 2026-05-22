import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: documentId } = await params;

  const snapshots = await prisma.docSnapshot.findMany({
    where: { documentId },
    orderBy: { version: "desc" },
    take: 20,
    select: { id: true, version: true, createdBy: true, createdAt: true },
  });

  return NextResponse.json(snapshots);
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: documentId } = await params;

  const body = await request.json() as { content: string };
  if (!body.content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const latest = await prisma.docSnapshot.findFirst({
    where: { documentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const snapshot = await prisma.docSnapshot.create({
    data: {
      documentId,
      content: body.content,
      version: (latest?.version ?? 0) + 1,
      createdBy: user.id,
    },
  });

  return NextResponse.json(snapshot, { status: 201 });
}
