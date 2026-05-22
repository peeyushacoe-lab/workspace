import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO"] as const;

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
};

/**
 * POST /api/push/send
 * Send a Web Push notification to one or all users.
 * Requires VAPID keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT.
 * Body: { userId?: string, title, body, url? }
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { userId?: string } & PushPayload;
  if (!body.title || !body.body) return NextResponse.json({ error: "title and body required" }, { status: 400 });

  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return NextResponse.json({
      sent: 0,
      stub: true,
      message: "VAPID keys not configured — push notifications require VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, and VAPID_SUBJECT env vars",
    });
  }

  // Load subscriptions
  const subscriptions = await prisma.auditLog.findMany({
    where: {
      action:  "PUSH_SUBSCRIBE",
      ...(body.userId ? { actorId: body.userId } : {}),
    },
  });

  if (subscriptions.length === 0) return NextResponse.json({ sent: 0 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webpush = await import("web-push" as never) as any;

    webpush.default.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@cybersage.local",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );

    const payload = JSON.stringify({
      title: body.title,
      body:  body.body,
      icon:  body.icon ?? "/icon-192.png",
      url:   body.url ?? "/inbox",
    });

    let sent = 0;
    const stale: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        const subscription = sub.metadata as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
        if (!subscription?.endpoint) return;
        try {
          await webpush.default.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys as never },
            payload,
          );
          sent++;
        } catch {
          stale.push(sub.id);
        }
      })
    );

    // Clean up expired subscriptions
    if (stale.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
    }

    return NextResponse.json({ sent, expired: stale.length });
  } catch {
    return NextResponse.json({ error: "web-push not installed — run: npm install web-push" }, { status: 500 });
  }
}
