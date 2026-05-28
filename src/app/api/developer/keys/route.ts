import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.aPIKey.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { name?: string; scopes?: string[]; expiresInDays?: number };
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const rawKey = `csk_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400 * 1000)
    : null;

  const apiKey = await prisma.aPIKey.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
      name: body.name.trim(),
      keyHash,
      keyPrefix,
      scopes: body.scopes ?? ["read"],
      expiresAt,
    },
    select: { id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ ...apiKey, rawKey }, { status: 201 });
}
