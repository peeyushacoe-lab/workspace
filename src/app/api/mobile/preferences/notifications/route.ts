import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type NotifPrefs = {
  dndEnabled: boolean;
  quietHoursStart: string;  // "HH:MM" 24h
  quietHoursEnd: string;    // "HH:MM" 24h
  mentionsOnly: boolean;
};

const DEFAULTS: NotifPrefs = {
  dndEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  mentionsOnly: false,
};

export async function GET(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { preferences: true },
  });

  const prefs = (dbUser?.preferences as Record<string, unknown> | null) ?? {};
  return NextResponse.json({
    dndEnabled: prefs.dndEnabled ?? DEFAULTS.dndEnabled,
    quietHoursStart: prefs.quietHoursStart ?? DEFAULTS.quietHoursStart,
    quietHoursEnd: prefs.quietHoursEnd ?? DEFAULTS.quietHoursEnd,
    mentionsOnly: prefs.mentionsOnly ?? DEFAULTS.mentionsOnly,
  });
}

export async function PUT(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Partial<NotifPrefs>;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { preferences: true },
  });

  const existing = (dbUser?.preferences as Record<string, unknown> | null) ?? {};
  const updated = {
    ...existing,
    ...(body.dndEnabled !== undefined ? { dndEnabled: Boolean(body.dndEnabled) } : {}),
    ...(body.quietHoursStart ? { quietHoursStart: body.quietHoursStart } : {}),
    ...(body.quietHoursEnd ? { quietHoursEnd: body.quietHoursEnd } : {}),
    ...(body.mentionsOnly !== undefined ? { mentionsOnly: Boolean(body.mentionsOnly) } : {}),
  };

  await prisma.user.update({
    where: { id: user.userId },
    data: { preferences: updated },
  });

  return NextResponse.json({ ok: true });
}
