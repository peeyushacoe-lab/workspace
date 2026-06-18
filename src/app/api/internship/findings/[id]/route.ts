import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

const patchSchema = z.object({
  status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
  comment: z.string().optional(), // adds a comment
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const data = patchSchema.parse(body);

  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  if (data.status && !isMentor) {
    return NextResponse.json({ error: "Only mentors can change finding status" }, { status: 403 });
  }

  const ops: Promise<unknown>[] = [];
  if (data.status) {
    ops.push(prisma.internFinding.update({ where: { id }, data: { status: data.status } }));
  }
  if (data.comment) {
    ops.push(prisma.internComment.create({ data: { body: data.comment, authorId: user.id, findingId: id } }));
  }
  await Promise.all(ops);

  const finding = await prisma.internFinding.findUnique({
    where: { id },
    include: {
      submitter: { select: { id: true, fullName: true, avatarUrl: true } },
      comments: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(finding);
}
