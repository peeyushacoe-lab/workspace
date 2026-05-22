import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

const scheduleSchema = z.object({
  scheduledAt: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  subject:     z.string().min(1).max(500),
  body:        z.string().min(1).max(100_000),
  toAddresses: z.array(z.string().email()).min(1).max(500),
  ccAddresses: z.array(z.string().email()).optional().default([]),
  bccAddresses: z.array(z.string().email()).optional().default([]),
  fromEmail:   z.string().email(),
  signatureId: z.string().optional(),
  metadata:    z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emails = await prisma.scheduledEmail.findMany({
    where: { userId: user.id, sentAt: null },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(emails);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = scheduleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (scheduledAt <= new Date()) {
    return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
  }

  const email = await prisma.scheduledEmail.create({
    data: {
      userId:      user.id,
      scheduledAt,
      subject:     parsed.data.subject,
      body:        parsed.data.body,
      toAddresses: parsed.data.toAddresses,
      ccAddresses: parsed.data.ccAddresses,
      bccAddresses: parsed.data.bccAddresses,
      fromEmail:   parsed.data.fromEmail,
      signatureId: parsed.data.signatureId ?? null,
      metadata:    parsed.data.metadata ? (parsed.data.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  return NextResponse.json(email, { status: 201 });
}
