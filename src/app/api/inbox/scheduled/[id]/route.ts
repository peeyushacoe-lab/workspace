import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const email = await prisma.scheduledEmail.findFirst({ where: { id, userId: user.id } });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email.sentAt) return NextResponse.json({ error: "Already sent — cannot cancel" }, { status: 409 });

  await prisma.scheduledEmail.delete({ where: { id } });
  return NextResponse.json({ cancelled: true });
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const email = await prisma.scheduledEmail.findFirst({ where: { id, userId: user.id } });
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email.sentAt) return NextResponse.json({ error: "Already sent" }, { status: 409 });

  const body = (await request.json()) as { scheduledAt?: string; subject?: string; body?: string };
  const updateData: Record<string, unknown> = {};

  if (body.scheduledAt) {
    const newDate = new Date(body.scheduledAt);
    if (isNaN(newDate.getTime()) || newDate <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be a valid future date" }, { status: 400 });
    }
    updateData.scheduledAt = newDate;
  }
  if (body.subject) updateData.subject = body.subject;
  if (body.body) updateData.body = body.body;

  const updated = await prisma.scheduledEmail.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}
