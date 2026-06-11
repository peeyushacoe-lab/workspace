import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const grantSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "sender"], { message: 'Role must be "viewer" or "sender"' }),
});

// GET /api/settings/delegation
// Returns granted (delegations current user has given others) and
// received (mailboxes other users have shared with the current user).
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the current user's own mailbox (email matches work email)
  const myMailbox = await prisma.mailbox.findUnique({
    where: { email: currentUser.email },
    select: { id: true },
  });

  const [granted, received] = await Promise.all([
    // Delegations this user has granted to others on their own mailbox
    myMailbox
      ? prisma.mailboxAccess.findMany({
          where: {
            mailboxId: myMailbox.id,
            userId: { not: currentUser.id }, // exclude own OWNER entry
          },
          select: {
            id: true,
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                fullName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [],

    // Mailboxes other users have shared with the current user
    prisma.mailboxAccess.findMany({
      where: {
        userId: currentUser.id,
        mailbox: {
          email: { not: currentUser.email }, // exclude own mailbox
        },
      },
      select: {
        id: true,
        mailboxId: true,
        role: true,
        createdAt: true,
        mailbox: {
          select: {
            email: true,
            displayName: true,
            accessLogs: {
              where: { role: "OWNER" },
              select: {
                user: {
                  select: { fullName: true },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Reshape received so mailbox.user is the owner (first OWNER entry)
  const receivedShaped = received.map((r) => ({
    id: r.id,
    mailboxId: r.mailboxId,
    role: r.role,
    createdAt: r.createdAt,
    mailbox: {
      email: r.mailbox.email,
      displayName: r.mailbox.displayName,
      user: r.mailbox.accessLogs[0]?.user ?? null,
    },
  }));

  return NextResponse.json({ granted, received: receivedShaped });
}

// POST /api/settings/delegation
// Body: { email: string, role: "viewer" | "sender" }
// Grants (or updates) access on the current user's mailbox.
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { email, role } = parsed.data;

  if (email.toLowerCase() === currentUser.email.toLowerCase()) {
    return NextResponse.json(
      { error: "You cannot delegate access to yourself" },
      { status: 400 },
    );
  }

  // Look up the target user
  const targetUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "No user found with that email address" }, { status: 404 });
  }

  // Find current user's mailbox
  const myMailbox = await prisma.mailbox.findUnique({
    where: { email: currentUser.email },
    select: { id: true },
  });
  if (!myMailbox) {
    return NextResponse.json(
      { error: "Your mailbox could not be found. Contact an administrator." },
      { status: 404 },
    );
  }

  // Upsert the delegation — update role if record already exists
  const access = await prisma.mailboxAccess.upsert({
    where: { mailboxId_userId: { mailboxId: myMailbox.id, userId: targetUser.id } },
    update: { role },
    create: { mailboxId: myMailbox.id, userId: targetUser.id, role },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return NextResponse.json(access, { status: 201 });
}

// DELETE /api/settings/delegation?id=accessId
// Revokes a delegation — only the granting user (mailbox owner) may do this.
export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Find the current user's mailbox
  const myMailbox = await prisma.mailbox.findUnique({
    where: { email: currentUser.email },
    select: { id: true },
  });
  if (!myMailbox) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  // Verify the access record belongs to the current user's mailbox
  const access = await prisma.mailboxAccess.findUnique({
    where: { id },
    select: { id: true, mailboxId: true },
  });
  if (!access || access.mailboxId !== myMailbox.id) {
    return NextResponse.json({ error: "Access record not found or not authorized" }, { status: 404 });
  }

  await prisma.mailboxAccess.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
