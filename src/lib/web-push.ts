import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@cybersage.local";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  await webpush.sendNotification(
    subscription as webpush.PushSubscription,
    JSON.stringify(payload)
  );
}
