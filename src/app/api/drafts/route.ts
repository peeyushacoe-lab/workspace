import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const draftSchema = z.object({
  id: z.string().optional(),
  to: z.string().max(2000).default(""),
  cc: z.string().max(2000).default(""),
  bcc: z.string().max(2000).default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(100_000).default(""),
  signatureId: z.string().optional(),
});

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id },
    orderBy: { savedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(drafts);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft data" }, { status: 400 });
  }

  const { id, to, cc, bcc, subject, body, signatureId } = parsed.data;

  if (id) {
    const existing = await prisma.draft.findUnique({ where: { id }, select: { userId: true } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const draft = await prisma.draft.update({
      where: { id },
      data: { to, cc, bcc, subject, body, signatureId },
    });
    return NextResponse.json(draft);
  }

  const draft = await prisma.draft.create({
    data: { userId: user.id, to, cc, bcc, subject, body, signatureId },
  });
  return NextResponse.json(draft, { status: 201 });
}
