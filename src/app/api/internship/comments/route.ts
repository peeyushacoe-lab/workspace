import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const HUB_ROLES = ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

const schema = z.object({
  body: z.string().min(1),
  announcementId: z.string().optional(),
  findingId: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const data = schema.parse(await request.json());

  if (!data.announcementId && !data.findingId) {
    return NextResponse.json({ error: "announcementId or findingId required" }, { status: 400 });
  }

  const comment = await prisma.internComment.create({
    data: {
      body: data.body,
      authorId: user.id,
      announcementId: data.announcementId ?? null,
      findingId: data.findingId ?? null,
    },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}
