import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draft = await prisma.draft.findFirst({
    where: { userId: user.userId },
    orderBy: { savedAt: "desc" },
  });
  return NextResponse.json(draft ?? null);
}

export async function PUT(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to, subject, body } = await request.json() as { to?: string; subject?: string; body?: string };

  const existing = await prisma.draft.findFirst({ where: { userId: user.userId }, orderBy: { savedAt: "desc" } });

  const draft = existing
    ? await prisma.draft.update({
        where: { id: existing.id },
        data: { to: to ?? "", subject: subject ?? "", body: body ?? "" },
      })
    : await prisma.draft.create({
        data: { userId: user.userId, to: to ?? "", subject: subject ?? "", body: body ?? "" },
      });

  return NextResponse.json(draft);
}

export async function DELETE(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.draft.deleteMany({ where: { userId: user.userId } });
  return NextResponse.json({ ok: true });
}
