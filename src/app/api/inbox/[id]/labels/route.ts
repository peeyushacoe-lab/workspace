import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  isStarred:  z.boolean().optional(),
  isArchived: z.boolean().optional(),
  isTrashed:  z.boolean().optional(),
  labels:     z.array(z.string().max(50)).max(10).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    include: { mailbox: { include: { accessLogs: { where: { userId: user.id }, select: { id: true } } } } },
  });

  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isPrivileged && thread.mailbox.accessLogs.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.inboxThread.update({
    where: { id },
    data: parsed.data,
    select: { id: true, isStarred: true, isArchived: true, isTrashed: true, labels: true },
  });

  return NextResponse.json(updated);
}
