import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serverConfigured = !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );

  const subscriptionCount = await prisma.auditLog.count({
    where: { actorId: user.id, action: "PUSH_SUBSCRIBE" },
  }).catch(() => 0);

  return NextResponse.json({
    serverConfigured,
    subscribed: subscriptionCount > 0,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
