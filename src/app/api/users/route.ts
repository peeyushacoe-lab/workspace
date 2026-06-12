import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/session";
import { CREATOR_PERMISSIONS, KEY_ROLES } from "@/lib/auth";
import { sendInviteEmail, sendWelcomeInboxMessage } from "@/lib/email";
import type { UserRole } from "@/generated/prisma/enums";

const createUserSchema = z.object({
  workEmail:     z.string().email("Invalid work email"),
  personalEmail: z.string().email("Invalid personal email"),
  fullName:      z.string().min(1, "Full name is required"),
  role:          z.string().min(1, "Role is required"),
  customRole:    z.string().optional(),
});

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

export async function GET() {
  const currentUser = await getCurrentUser();
  const allowed = CREATOR_PERMISSIONS[currentUser?.role as UserRole];
  if (!currentUser || !allowed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: currentUser.organizationId ? { organizationId: currentUser.organizationId } : undefined,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      mustResetPassword: true,
      personalEmail: true,
      createdAt: true,
      invitedBy: true,
      signature: { select: { fullName: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const creatableRoles = CREATOR_PERMISSIONS[currentUser.role as UserRole];
  if (!creatableRoles || creatableRoles.length === 0) {
    return NextResponse.json({ error: "You don't have permission to create users" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = createUserSchema.parse(body);
    const role = validated.role as UserRole;

    // Check creator can assign this role
    if (!creatableRoles.includes(role)) {
      return NextResponse.json(
        { error: `Your role cannot create ${role} accounts` },
        { status: 403 },
      );
    }

    // Key roles can only exist once — enforce uniqueness
    if (KEY_ROLES.has(role)) {
      const existing = await prisma.user.findFirst({
        where: { role },
        select: { id: true, fullName: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: `A ${role} account already exists (${existing.fullName}). Delete it first before creating another.` },
          { status: 409 },
        );
      }
    }

    // Check work email not already taken
    const existingEmail = await prisma.user.findUnique({
      where: { email: validated.workEmail },
      select: { id: true },
    });
    if (existingEmail) {
      return NextResponse.json({ error: "That work email is already in use" }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email: validated.workEmail,
        personalEmail: validated.personalEmail,
        passwordHash: hashedPassword,
        fullName: validated.fullName,
        role,
        ...(validated.customRole ? { customRole: validated.customRole } : {}),
        mustResetPassword: true,
        invitedBy: currentUser.id,
        organizationId: currentUser.organizationId ?? undefined,
        orgRole: "MEMBER",
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        mustResetPassword: true,
        createdAt: true,
      },
    });

    // Auto-create mailbox for the new user, then ensure the access log exists
    // (upsert create path handles new mailboxes; the explicit upsert below handles
    //  pre-existing mailboxes where update:{} would silently skip access log creation)
    const mailbox = await prisma.mailbox.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        displayName: user.fullName,
        isShared: false,
        accessLogs: { create: { userId: user.id, role: "OWNER" } },
      },
      select: { id: true },
    }).catch(err => { console.error("[mailbox create]", err); return null; });

    if (mailbox) {
      await prisma.mailboxAccess.upsert({
        where: { mailboxId_userId: { mailboxId: mailbox.id, userId: user.id } },
        update: {},
        create: { mailboxId: mailbox.id, userId: user.id, role: "OWNER" },
      }).catch(err => console.error("[mailbox access]", err));
    }

    // Send invite email to personal address — fire-and-forget (don't block response)
    sendInviteEmail({
      toPersonalEmail: validated.personalEmail,
      fullName: validated.fullName,
      workEmail: validated.workEmail,
      tempPassword,
      invitedByName: currentUser.fullName,
    }).catch(err => console.error("[invite email]", err));

    // Auto-join new user to all non-private channels so they can access team chat
    prisma.chatChannel.findMany({ where: { isPrivate: false }, select: { id: true } })
      .then(async (channels) => {
        for (const ch of channels) {
          await prisma.chatMember.upsert({
            where: { channelId_userId: { channelId: ch.id, userId: user.id } },
            update: {},
            create: { channelId: ch.id, userId: user.id, role: "MEMBER" },
          }).catch(() => {});
        }
      }).catch(err => console.error("[chat auto-join]", err));

    // Deliver welcome message directly to their Nexus inbox — fire-and-forget
    sendWelcomeInboxMessage({
      userId: user.id,
      workEmail: validated.workEmail,
      fullName: validated.fullName,
      role,
      invitedByName: currentUser.fullName,
    }).catch(err => console.error("[welcome inbox]", err));

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
