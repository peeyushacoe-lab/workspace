import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const week = await prisma.internWeek.findUnique({
    where: { id },
    select: { id: true, isUnlocked: true, weekNumber: true },
  });
  if (!week) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!week.isUnlocked) return NextResponse.json({ error: "Week is locked" }, { status: 400 });

  await prisma.internWeekCompletion.upsert({
    where: { weekId_internId: { weekId: id, internId: session.id } },
    update: {},
    create: { weekId: id, internId: session.id },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  await prisma.internWeekCompletion.deleteMany({
    where: { weekId: id, internId: session.id },
  });

  return NextResponse.json({ success: true });
}
