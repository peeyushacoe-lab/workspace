import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const progressSchema = z.object({
  nexusUserId:  z.string(),
  course:       z.string(),
  certificate:  z.string().optional(),
  badge:        z.string().optional(),
  completedAt:  z.string().optional(),
});

export async function POST(request: Request) {
  // Authenticate with the shared SSO secret
  const secret = process.env.NEXUS_SSO_SECRET;
  if (!secret) return NextResponse.json({ error: "SSO not configured" }, { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { nexusUserId, course, certificate, badge, completedAt } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: nexusUserId },
    select: { id: true, preferences: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const prefs = (user.preferences as Record<string, unknown> | null) ?? {};
  const forage = (prefs.forage as Record<string, unknown> | null) ?? {};
  const existing = Array.isArray(forage.progress) ? (forage.progress as object[]) : [];

  const entry = {
    course,
    ...(certificate ? { certificate } : {}),
    ...(badge       ? { badge }       : {}),
    completedAt: completedAt ?? new Date().toISOString(),
  };

  const progress = [...existing, entry];

  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferences: {
        ...prefs,
        forage: { ...forage, progress },
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, total: progress.length });
}
