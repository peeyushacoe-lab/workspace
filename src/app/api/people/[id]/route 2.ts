import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const person = await prisma.user.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      fullName: true,
      displayName: true,
      email: true,
      role: true,
      avatarUrl: true,
      coverUrl: true,
      jobTitle: true,
      department: true,
      company: true,
      phone: true,
      website: true,
      location: true,
      timezone: true,
      bio: true,
      pronouns: true,
      statusMessage: true,
      statusEmoji: true,
      createdAt: true,
    },
  });

  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(person);
}
