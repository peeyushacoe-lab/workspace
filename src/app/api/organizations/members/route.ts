import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId, isActive: true },
    select: {
      id: true, fullName: true, email: true, role: true,
      orgRole: true, avatarUrl: true, createdAt: true,
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(members);
}
