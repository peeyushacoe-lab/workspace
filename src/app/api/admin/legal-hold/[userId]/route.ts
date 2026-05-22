import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO"] as const;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "LEGAL_HOLD_RELEASED",
      targetType: "User",
      targetId: userId,
      metadata: { targetUserId: userId, releasedBy: user.fullName },
    },
  });

  return NextResponse.json({ success: true });
}
