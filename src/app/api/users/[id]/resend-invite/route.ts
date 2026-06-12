import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { CREATOR_PERMISSIONS } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import type { UserRole } from "@/generated/prisma/enums";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creatableRoles = CREATOR_PERMISSIONS[currentUser.role as UserRole];
  if (!creatableRoles || creatableRoles.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      personalEmail: true,
      fullName: true,
      role: true,
      invitedBy: true,
      mustResetPassword: true,
    },
  });

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Only allow resending for users the caller has permission to manage
  if (!creatableRoles.includes(target.role as UserRole)) {
    return NextResponse.json(
      { error: "You cannot manage this user's role" },
      { status: 403 },
    );
  }

  // Also restrict to users the caller actually invited (unless ADMIN)
  if (currentUser.role !== "ADMIN" && target.invitedBy !== currentUser.id) {
    return NextResponse.json(
      { error: "You can only resend invites for users you invited" },
      { status: 403 },
    );
  }

  if (!target.personalEmail) {
    return NextResponse.json(
      { error: "No personal email on file — cannot resend invite" },
      { status: 400 },
    );
  }

  // Issue a fresh temp password so the resent invite is usable
  const tempPassword = generateTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: hashedPassword, mustResetPassword: true },
  });

  try {
    await sendInviteEmail({
      toPersonalEmail: target.personalEmail,
      fullName: target.fullName,
      workEmail: target.email,
      tempPassword,
      invitedByName: currentUser.fullName,
    });
  } catch (err) {
    console.error("[resend-invite] email error", err);
    return NextResponse.json(
      { error: "User password reset but invite email failed to send. Check your Resend configuration." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
