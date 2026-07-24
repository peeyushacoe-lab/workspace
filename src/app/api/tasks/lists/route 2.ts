import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// GET /api/tasks/lists — personal list + team lists in the user's org
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lists = await prisma.taskList.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        { isTeamList: true, organizationId: user.organizationId ?? undefined },
      ],
    },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ lists });
}

// POST /api/tasks/lists — create a personal or team list
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; isTeamList?: boolean };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "List name is required" }, { status: 400 });
  }

  const list = await prisma.taskList.create({
    data: {
      name: body.name.trim(),
      ownerId: user.id,
      isTeamList: !!body.isTeamList,
      organizationId: body.isTeamList ? user.organizationId ?? null : null,
    },
  });

  return NextResponse.json({ list }, { status: 201 });
}
