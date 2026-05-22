import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: user.id } });
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: id },
    orderBy: { attemptedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ ...endpoint, secret: "••••••••", deliveries });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: user.id } });
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json() as { isActive?: boolean; events?: string[]; url?: string };
  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.events && { events: body.events }),
      ...(body.url && { url: body.url }),
    },
  });

  return NextResponse.json({ ...updated, secret: "••••••••" });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, userId: user.id } });
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.webhookEndpoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
