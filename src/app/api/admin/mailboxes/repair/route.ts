import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/mailboxes/repair
// Ensures every user has a MailboxAccess record for their own mailbox.
// Safe to run multiple times (upsert).
export async function POST() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  let repaired = 0;
  for (const u of users) {
    const mailbox = await prisma.mailbox.findUnique({
      where: { email: u.email },
      select: { id: true },
    });
    if (!mailbox) continue;

    const result = await prisma.mailboxAccess.upsert({
      where: { mailboxId_userId: { mailboxId: mailbox.id, userId: u.id } },
      update: {},
      create: { mailboxId: mailbox.id, userId: u.id, role: "OWNER" },
    });
    if (result) repaired++;
  }

  return NextResponse.json({ ok: true, usersChecked: users.length, repaired });
}
