import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { displayName, isShared, isNoReply, allowedRoles } = (await request.json()) as {
    displayName?: string;
    isShared?: boolean;
    isNoReply?: boolean;
    allowedRoles?: UserRole[];
  };

  const mailbox = await prisma.mailbox.update({
    where: { id },
    data: {
      ...(displayName ? { displayName } : {}),
      ...(isShared !== undefined ? { isShared } : {}),
      ...(isNoReply !== undefined ? { isNoReply } : {}),
      ...(allowedRoles ? { allowedRoles } : {}),
    },
  });

  return NextResponse.json(mailbox);
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.mailbox.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
