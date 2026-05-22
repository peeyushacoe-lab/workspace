import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const mailboxes = await prisma.mailbox.findMany({
    include: {
      accessLogs: {
        include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
      },
      _count: { select: { threads: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(mailboxes);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, displayName, isShared, isNoReply, allowedRoles } =
    (await request.json()) as {
      email: string;
      displayName: string;
      isShared?: boolean;
      isNoReply?: boolean;
      allowedRoles?: UserRole[];
    };

  if (!email?.trim() || !displayName?.trim()) {
    return NextResponse.json({ error: "email and displayName are required" }, { status: 400 });
  }

  const mailbox = await prisma.mailbox.create({
    data: {
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      isShared: isShared ?? false,
      isNoReply: isNoReply ?? false,
      allowedRoles: allowedRoles ?? [],
      accessLogs: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  return NextResponse.json(mailbox, { status: 201 });
}
