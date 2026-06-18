import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const HUB_ROLES = ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

const schema = z.object({
  emoji: z.string().min(1),
  announcementId: z.string().optional(),
  discussionId: z.string().optional(),
});

// Toggle reaction — one emoji per user per item (clicking same = remove, different = switch)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const data = schema.parse(await request.json());

  if (!data.announcementId && !data.discussionId) {
    return NextResponse.json({ error: "announcementId or discussionId required" }, { status: 400 });
  }

  const where = data.announcementId
    ? { userId_announcementId: { userId: user.id, announcementId: data.announcementId } }
    : { userId_discussionId: { userId: user.id, discussionId: data.discussionId! } };

  const existing = await prisma.internReaction.findFirst({
    where: {
      userId: user.id,
      ...(data.announcementId ? { announcementId: data.announcementId } : { discussionId: data.discussionId }),
    },
  });

  if (existing) {
    if (existing.emoji === data.emoji) {
      // Same emoji — remove it
      await prisma.internReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ action: "removed" });
    } else {
      // Different emoji — switch it
      await prisma.internReaction.update({
        where: { id: existing.id },
        data: { emoji: data.emoji },
      });
      return NextResponse.json({ action: "switched" });
    }
  }

  // No existing reaction — add new
  await prisma.internReaction.create({
    data: {
      emoji: data.emoji,
      userId: user.id,
      announcementId: data.announcementId ?? null,
      discussionId: data.discussionId ?? null,
    },
  });

  void where;
  return NextResponse.json({ action: "added" });
}
