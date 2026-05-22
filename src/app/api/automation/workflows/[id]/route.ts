import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const MGMT_ROLES = ["ADMIN", "CEO", "OPS_MANAGER", "COO"] as const;
type MgmtRole = (typeof MGMT_ROLES)[number];

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      runs: { orderBy: { startedAt: "desc" }, take: 20 },
      _count: { select: { runs: true } },
    },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(workflow);
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MGMT_ROLES.includes(user.role as MgmtRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await request.json() as {
    name?: string;
    description?: string;
    status?: string;
    trigger?: Record<string, unknown>;
    actions?: unknown[];
    isAIPowered?: boolean;
    aiPrompt?: string;
  };

  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status && { status: body.status as never }),
      ...(body.trigger && { trigger: body.trigger as never }),
      ...(body.actions && { actions: body.actions as never }),
      ...(body.isAIPowered !== undefined && { isAIPowered: body.isAIPowered }),
      ...(body.aiPrompt !== undefined && { aiPrompt: body.aiPrompt }),
    },
  });

  return NextResponse.json(workflow);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MGMT_ROLES.includes(user.role as MgmtRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.workflow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
