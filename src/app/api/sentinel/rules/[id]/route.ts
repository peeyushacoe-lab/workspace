import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;
type SecurityRole = (typeof SECURITY_ROLES)[number];

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await request.json() as { isActive?: boolean; severity?: string; action?: string; logic?: Record<string, unknown> };
  const rule = await prisma.detectionRule.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.severity && { severity: body.severity }),
      ...(body.action && { action: body.action }),
      ...(body.logic && { logic: body.logic as never }),
    },
  });
  return NextResponse.json(rule);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.detectionRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
