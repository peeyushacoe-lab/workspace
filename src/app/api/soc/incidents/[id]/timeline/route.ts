import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: incidentId } = await params;
  const { action, note } = (await request.json()) as { action: string; note?: string };

  if (!action?.trim()) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const entry = await prisma.incidentTimeline.create({
    data: { incidentId, userId: user.id, action, note },
  });

  return NextResponse.json(entry, { status: 201 });
}
