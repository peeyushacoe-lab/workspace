import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name:        z.string().min(1).max(60).optional(),
  description: z.string().max(200).optional(),
  isSingleton: z.boolean().optional(),
  color:       z.string().max(20).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CEO", "CISO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json() as unknown;
    const data = patchSchema.parse(body);
    const role = await prisma.customRole.update({ where: { id }, data });
    return NextResponse.json(role);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CEO", "CISO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.customRole.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
