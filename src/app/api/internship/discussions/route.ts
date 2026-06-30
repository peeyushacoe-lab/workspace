import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  // An empty/absent taskId means the general channel — treat "" as null so it
  // matches rows stored with taskId = null (the bug: "" never matched null).
  const taskId = searchParams.get("taskId") || null;
  const internId = searchParams.get("internId") || null;

  const discussions = await prisma.internDiscussion.findMany({
    where: {
      parentId: null, // top-level only
      ...(internId ? { authorId: internId } : { taskId: taskId }),
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "asc" }],
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      replies: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
    },
  });

  return NextResponse.json(discussions);
}

const createSchema = z.object({
  body: z.string().min(1),
  taskId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const data = createSchema.parse(body);

  const msg = await prisma.internDiscussion.create({
    data: {
      body: data.body,
      authorId: user.id,
      taskId: data.taskId ?? null,
      parentId: data.parentId ?? null,
    },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      replies: true,
      reactions: true,
    },
  });

  return NextResponse.json(msg, { status: 201 });
}
