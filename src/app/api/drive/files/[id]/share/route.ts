import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/events";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as {
    expiresInDays?: unknown;
    expiresAt?: unknown;
    role?: unknown;
    email?: unknown;
    createLink?: unknown;
  };

  const expiresInDays = typeof body.expiresInDays === "number" ? body.expiresInDays : undefined;
  const customExpiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : undefined;
  const role = typeof body.role === "string" ? body.role : "VIEWER";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
  const createLink = body.createLink !== false; // default true

  const VALID_ROLES = new Set(["VIEWER", "EDITOR"]);
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ error: "Invalid role. Must be VIEWER or EDITOR." }, { status: 400 });
  }

  if (expiresInDays !== undefined) {
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
      return NextResponse.json({ error: "expiresInDays must be between 1 and 365" }, { status: 400 });
    }
  }

  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Calculate expiry
  let expiresAtDate: Date | undefined;
  if (customExpiresAt && !isNaN(customExpiresAt.getTime())) {
    if (customExpiresAt <= new Date()) {
      return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
    }
    expiresAtDate = customExpiresAt;
  } else if (expiresInDays) {
    expiresAtDate = new Date(Date.now() + expiresInDays * 86400000);
  }
  // If neither provided, no expiry (null = never expires)

  const results: {
    token?: string;
    shareUrl?: string;
    expiresAt?: Date | null;
    emailShared?: boolean;
  } = {};

  // Email-based share
  if (email) {
    const targetUser = await prisma.user.findUnique({ where: { email } });
    await prisma.drivePermission.create({
      data: {
        fileId: id,
        userId: targetUser?.id ?? undefined,
        email,
        role,
        expiresAt: expiresAtDate ?? null,
      },
    });
    results.emailShared = true;
  }

  // Link-based share
  if (createLink) {
    const token = randomBytes(24).toString("base64url");
    const permission = await prisma.drivePermission.create({
      data: {
        fileId: id,
        role,
        token,
        expiresAt: expiresAtDate ?? null,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    results.token = token;
    results.shareUrl = `${appUrl}/share/${token}`;
    results.expiresAt = permission.expiresAt;
  }

  emitEvent("FILE_SHARED", {
    fileId: id,
    fileName: file.name,
    actorId: user.id,
    role,
    email,
    createLink,
  });

  logAudit({
    actorId: user.id,
    action: "DRIVE_FILE_SHARE",
    targetType: "DriveFile",
    targetId: id,
    metadata: { fileName: file.name, role, email: email ?? null, createLink },
  });

  return NextResponse.json(results);
}

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.driveFile.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const permissions = await prisma.drivePermission.findMany({
    where: { fileId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(permissions);
}
