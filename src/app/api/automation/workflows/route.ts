import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MGMT_ROLES = ["ADMIN", "CEO", "OPS_MANAGER", "COO"] as const;
type MgmtRole = (typeof MGMT_ROLES)[number];

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const workflows = await prisma.workflow.findMany({
    where: {
      OR: [{ createdById: user.id }, {}],
      ...(status ? { status: status as never } : {}),
    },
    include: { _count: { select: { runs: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(workflows);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MGMT_ROLES.includes(user.role as MgmtRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    name: string;
    description?: string;
    trigger: Record<string, unknown>;
    actions: unknown[];
    isAIPowered?: boolean;
    aiPrompt?: string;
  };

  if (!body.name || !body.trigger || !body.actions) {
    return NextResponse.json({ error: "name, trigger, actions required" }, { status: 400 });
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      trigger: body.trigger as never,
      actions: body.actions as never,
      createdById: user.id,
      isAIPowered: body.isAIPowered ?? false,
      aiPrompt: body.aiPrompt ?? null,
    },
  });

  return NextResponse.json(workflow, { status: 201 });
}
