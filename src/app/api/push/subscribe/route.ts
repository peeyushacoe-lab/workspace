import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

type PushSubscriptionJSON = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
};

/**
 * POST /api/push/subscribe
 * Store a Web Push subscription for the current user.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await request.json() as PushSubscriptionJSON;
  if (!sub?.endpoint) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  // Store in AuditLog with action PUSH_SUBSCRIBE for now (no separate model).
  // If there is an existing subscription from this endpoint for this user, replace it.
  await prisma.auditLog.upsert({
    where: {
      // Use the endpoint as a unique key. Stable if user re-registers same device.
      id: `push_${user.id}_${Buffer.from(sub.endpoint).toString("base64").slice(0, 32)}`,
    },
    create: {
      id:         `push_${user.id}_${Buffer.from(sub.endpoint).toString("base64").slice(0, 32)}`,
      actorId:    user.id,
      action:     "PUSH_SUBSCRIBE",
      targetType: "PushSubscription",
      targetId:   user.id,
      metadata:   sub as unknown as Prisma.InputJsonValue,
    },
    update: {
      metadata: sub as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ subscribed: true });
}

/**
 * DELETE /api/push/subscribe
 * Remove a Web Push subscription.
 */
export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await request.json() as { endpoint?: string };
  if (!sub?.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const id = `push_${user.id}_${Buffer.from(sub.endpoint).toString("base64").slice(0, 32)}`;
  await prisma.auditLog.deleteMany({ where: { id, actorId: user.id } });

  return NextResponse.json({ unsubscribed: true });
}
