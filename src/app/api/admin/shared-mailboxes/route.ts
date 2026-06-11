import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Redis key helpers
const SHARED_SET_KEY = "shared-mailboxes"; // set of mailboxId strings
const membersKey = (mailboxId: string) => `shared-mailbox-members:${mailboxId}`;

// ─── GET /api/admin/shared-mailboxes ─────────────────────────────────────────
// Returns all mailboxes designated as shared (tracked in Redis) enriched with
// their current member list (MailboxAccess rows + Redis set intersection).
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 1. Fetch the set of shared mailbox IDs from Redis
  const sharedIds = await redis.smembers(SHARED_SET_KEY);

  if (sharedIds.length === 0) {
    return NextResponse.json([]);
  }

  // 2. Pull Prisma records for those mailboxes, including their access grants
  const mailboxes = await prisma.mailbox.findMany({
    where: { id: { in: sharedIds } },
    include: {
      accessLogs: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Attach the Redis-managed member IDs as well so the UI has a canonical list
  const enriched = await Promise.all(
    mailboxes.map(async (mb) => {
      const redisMemberIds = await redis.smembers(membersKey(mb.id));
      return { ...mb, redisMemberIds };
    })
  );

  return NextResponse.json(enriched);
}

// ─── POST /api/admin/shared-mailboxes ────────────────────────────────────────
// Creates a new shared mailbox (or marks an existing Mailbox as shared) and
// stores members in both MailboxAccess (Prisma) and the Redis set.
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    email?: string;
    displayName?: string;
    description?: string;
    memberIds?: string[];
  };

  const { email, displayName, description, memberIds = [] } = body;

  if (!email?.trim() || !displayName?.trim()) {
    return NextResponse.json(
      { error: "email and displayName are required" },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Upsert the Mailbox row — mark isShared = true
  const mailbox = await prisma.mailbox.upsert({
    where: { email: normalizedEmail },
    update: {
      displayName: displayName.trim(),
      isShared: true,
      // description field doesn't exist on the Prisma model, so we skip it.
    },
    create: {
      email: normalizedEmail,
      displayName: displayName.trim(),
      isShared: true,
      isNoReply: false,
      allowedRoles: [],
    },
  });

  // Register the mailbox in the Redis shared set
  await redis.sadd(SHARED_SET_KEY, mailbox.id);

  // Sync member access — delete existing MailboxAccess rows for non-owner
  // members, then re-create for the supplied list.
  if (memberIds.length > 0) {
    // Verify all memberIds exist
    const users = await prisma.user.findMany({
      where: { id: { in: memberIds }, isActive: true },
      select: { id: true },
    });
    const validIds = users.map((u) => u.id);

    // Upsert MailboxAccess rows (EDITOR role for members)
    await Promise.all(
      validIds.map((uid) =>
        prisma.mailboxAccess.upsert({
          where: { mailboxId_userId: { mailboxId: mailbox.id, userId: uid } },
          update: { role: "EDITOR" },
          create: { mailboxId: mailbox.id, userId: uid, role: "EDITOR" },
        })
      )
    );

    // Replace the Redis member set
    const key = membersKey(mailbox.id);
    await redis.del(key);
    if (validIds.length > 0) {
      await redis.sadd(key, ...validIds);
    }
  }

  // Store description as a separate Redis hash field (lightweight, no migration)
  if (description?.trim()) {
    await redis.hset(`shared-mailbox-meta:${mailbox.id}`, "description", description.trim());
  }

  return NextResponse.json(mailbox, { status: 201 });
}

// ─── PATCH /api/admin/shared-mailboxes ───────────────────────────────────────
// Updates the member list for an existing shared mailbox.
// Body: { id: string; memberIds: string[] }
export async function PATCH(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { id?: string; memberIds?: string[] };
  const { id, memberIds } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Confirm the mailbox is in the shared set
  const isMember = await redis.sismember(SHARED_SET_KEY, id);
  if (!isMember) {
    return NextResponse.json({ error: "Shared mailbox not found" }, { status: 404 });
  }

  const newMemberIds = memberIds ?? [];

  // Validate user IDs
  const users = await prisma.user.findMany({
    where: { id: { in: newMemberIds }, isActive: true },
    select: { id: true },
  });
  const validIds = users.map((u) => u.id);

  // Remove all existing EDITOR/VIEWER access entries for this mailbox
  await prisma.mailboxAccess.deleteMany({
    where: { mailboxId: id, role: { in: ["EDITOR", "VIEWER"] } },
  });

  // Create fresh access entries
  if (validIds.length > 0) {
    await prisma.mailboxAccess.createMany({
      data: validIds.map((uid) => ({
        mailboxId: id,
        userId: uid,
        role: "EDITOR" as const,
      })),
      skipDuplicates: true,
    });
  }

  // Replace the Redis member set
  const key = membersKey(id);
  await redis.del(key);
  if (validIds.length > 0) {
    await redis.sadd(key, ...validIds);
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/admin/shared-mailboxes?id=mailboxId ─────────────────────────
// Removes the shared designation. Does NOT delete the underlying Mailbox row —
// it simply unmarks isShared and removes Redis tracking keys.
export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  // Update Prisma row
  await prisma.mailbox.update({
    where: { id },
    data: { isShared: false },
  });

  // Purge Redis state
  await redis.srem(SHARED_SET_KEY, id);
  await redis.del(membersKey(id));
  await redis.del(`shared-mailbox-meta:${id}`);

  return NextResponse.json({ ok: true });
}
