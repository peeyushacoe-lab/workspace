import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

const nstr = (max: number) => z.string().max(max).nullish();

const updateSchema = z.object({
  fullName:       z.string().min(1).max(120).optional(),
  displayName:    nstr(60),
  bio:            nstr(500),
  jobTitle:       nstr(100),
  statusEmoji:    nstr(10),
  statusMessage:  nstr(140),
  avatarUrl:      z.string().max(300_000).nullish(),
  currentPassword: z.string().min(1).optional(),
  newPassword:    z.string().min(8).optional(),
});

export async function GET(request: Request) {
  const auth = await getMobileUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true, email: true, fullName: true, role: true, customRole: true,
      displayName: true, bio: true, jobTitle: true, avatarUrl: true,
      statusEmoji: true, statusMessage: true, timezone: true, language: true,
      mfaEnabled: true, createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(request: Request) {
  const auth = await getMobileUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const data = updateSchema.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};
    const plain = ["fullName","displayName","bio","jobTitle","statusEmoji","statusMessage","avatarUrl"] as const;
    for (const f of plain) { if (data[f] !== undefined) update[f] = data[f]; }

    if (data.newPassword) {
      if (!data.currentPassword) return NextResponse.json({ error: "Current password required" }, { status: 400 });
      const row = await prisma.user.findUnique({ where: { id: auth.userId }, select: { passwordHash: true } });
      if (!row?.passwordHash) return NextResponse.json({ error: "Password not set" }, { status: 400 });
      if (!(await bcrypt.compare(data.currentPassword, row.passwordHash))) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
      update.passwordHash = await bcrypt.hash(data.newPassword, 12);
    }

    if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: update,
      select: {
        id: true, email: true, fullName: true, role: true,
        displayName: true, bio: true, jobTitle: true, avatarUrl: true,
        statusEmoji: true, statusMessage: true,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
