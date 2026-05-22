import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rule = await prisma.mailRule.findFirst({ where: { id, userId: user.id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    name?: string;
    isActive?: boolean;
    priority?: number;
    conditions?: unknown;
    action?: string;
    actionData?: unknown;
  };

  const updated = await prisma.mailRule.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.conditions ? { conditions: body.conditions } : {}),
      ...(body.action ? { action: body.action as never } : {}),
      ...(body.actionData !== undefined ? { actionData: body.actionData === null ? Prisma.JsonNull : (body.actionData as Prisma.InputJsonValue) } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rule = await prisma.mailRule.findFirst({ where: { id, userId: user.id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mailRule.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
