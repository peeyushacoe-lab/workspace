import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * GET /api/workspace/members
 * Returns lightweight identity info for all active workspace members.
 * Used by the inbox and chat to display real names and avatars.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      email: true,
      fullName: true,
      displayName: true,
      avatarUrl: true,
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(members);
}
