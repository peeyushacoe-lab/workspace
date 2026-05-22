import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;

/**
 * PATCH /api/sentinel/alerts/:id
 * Acknowledge or resolve an alert.
 */
export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as (typeof SECURITY_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json() as { acknowledged?: boolean; resolvedAt?: string };

  const alert = await prisma.sentinelAlert.findFirst({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.sentinelAlert.update({
    where: { id },
    data: {
      ...(typeof body.acknowledged === "boolean" ? { acknowledged: body.acknowledged } : {}),
      ...(body.resolvedAt !== undefined ? { resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : null } : {}),
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/sentinel/alerts/:id
 * Delete an alert (admin/CISO only).
 */
export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "CISO") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const alert = await prisma.sentinelAlert.findFirst({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.sentinelAlert.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
