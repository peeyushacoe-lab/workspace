import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileUser(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const byEmail = searchParams.get("byEmail") === "1";

  const user = await prisma.user.findUnique({
    where: byEmail ? { email: id } : { id, isActive: true },
    select: {
      id: true,
      email: true,
      fullName: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      customRole: true,
      jobTitle: true,
      department: true,
      bio: true,
      statusEmoji: true,
      statusMessage: true,
      pronouns: true,
      location: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}
