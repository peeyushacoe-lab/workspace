import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";

const VALID_SCOPES = ["email:read", "email:write", "drive:read", "drive:write", "chat:read", "chat:write", "calendar:read", "calendar:write", "ai:read", "admin:read"] as const;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.aPIKey.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, keyPrefix: true, scopes: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { name: string; scopes?: string[]; expiresInDays?: number };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const scopes = (body.scopes ?? []).filter((s) => VALID_SCOPES.includes(s as never));

  // Generate key: cs_live_<32 random hex chars>
  const rawKey = `cs_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = await bcrypt.hash(rawKey, 10);
  const keyPrefix = rawKey.slice(0, 12); // "cs_live_XXXX"

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000)
    : null;

  const apiKey = await prisma.aPIKey.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      keyHash,
      keyPrefix,
      scopes,
      expiresAt,
    },
  });

  // Return raw key ONCE — never stored in plain text
  return NextResponse.json({
    id: apiKey.id,
    name: apiKey.name,
    key: rawKey,
    keyPrefix,
    scopes,
    expiresAt,
    createdAt: apiKey.createdAt,
  }, { status: 201 });
}
