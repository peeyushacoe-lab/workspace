import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const presence = await prisma.userPresence.findUnique({
    where: { userId: user.userId },
  });

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { preferences: true },
  });

  const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    status: presence?.status ?? "OFFLINE",
    statusMessage: presence?.statusMessage ?? null,
    lastSeenAt: presence?.lastSeenAt ?? null,
    workLocation: (prefs["workLocation"] as string | null) ?? null,
  });
}

export async function PUT(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    status?: string;
    statusMessage?: string | null;
    workLocation?: string | null;
  };

  const validStatuses = new Set(["ONLINE", "AWAY", "BUSY", "INVISIBLE", "OFFLINE"]);

  const updates: { status?: "ONLINE" | "AWAY" | "BUSY" | "INVISIBLE" | "OFFLINE"; statusMessage?: string | null; lastSeenAt?: Date } = {
    lastSeenAt: new Date(),
  };

  if (body.status && validStatuses.has(body.status)) {
    updates.status = body.status as "ONLINE" | "AWAY" | "BUSY" | "INVISIBLE" | "OFFLINE";
  }
  if ("statusMessage" in body) {
    updates.statusMessage = body.statusMessage ?? null;
  }

  const presence = await prisma.userPresence.upsert({
    where: { userId: user.userId },
    update: updates,
    create: { userId: user.userId, ...updates },
  });

  if ("workLocation" in body) {
    const current = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { preferences: true },
    });
    const prefs = ((current?.preferences ?? {}) as Record<string, unknown>);
    await prisma.user.update({
      where: { id: user.userId },
      data: { preferences: { ...prefs, workLocation: body.workLocation ?? null } },
    });
  }

  return NextResponse.json({ ok: true, presence });
}
