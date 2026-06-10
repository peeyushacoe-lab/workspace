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
      id: true,
      email: true,
      fullName: true,
      displayName: true,
      // avatarUrl omitted — served via /api/workspace/avatar/[id] to keep this response light
      role: true,
      customRole: true,
      jobTitle: true,
      department: true,
      bio: true,
      statusEmoji: true,
      statusMessage: true,
      pronouns: true,
      location: true,
      timezone: true,
    },
    orderBy: { fullName: "asc" },
  });

  // Attach a stable avatar URL for each member instead of the raw base64 blob
  const membersWithAvatarUrl = members.map(m => ({
    ...m,
    avatarUrl: `/api/workspace/avatar/${m.id}`,
  }));

  return NextResponse.json(membersWithAvatarUrl);
}
