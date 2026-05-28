/**
 * Mobile Push Token Registration — Phase 21
 * Registers / refreshes a device push token (FCM or APNs via Expo).
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { token?: string; platform?: string };
  if (!body.token || typeof body.token !== "string")
    return NextResponse.json({ error: "token is required" }, { status: 400 });

  await prisma.mobilePushToken.upsert({
    where: { token: body.token },
    update: { userId: user.id, platform: body.platform ?? "unknown" },
    create: { userId: user.id, token: body.token, platform: body.platform ?? "unknown" },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { token?: string };
  if (!body.token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  await prisma.mobilePushToken.deleteMany({
    where: { token: body.token, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
