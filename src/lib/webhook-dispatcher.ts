import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * Dispatch an event to all active webhook endpoints subscribed to it.
 * Fire-and-forget — call with .catch(() => {}) from event handlers.
 */
export async function dispatchWebhook(
  event: string,
  payload: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isActive: true,
      failCount: { lt: 10 },
      events: { has: event },
      ...(userId ? { userId } : {}),
    },
  });

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      const sig = ep.secret
        ? `sha256=${crypto.createHmac("sha256", ep.secret).update(body).digest("hex")}`
        : undefined;

      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let success = false;

      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CyberSage-Event": event,
            ...(sig ? { "X-CyberSage-Signature": sig } : {}),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        responseBody = await res.text().catch(() => null);
        success = res.ok;
      } catch {
        success = false;
      }

      await prisma.webhookDelivery.create({
        data: { endpointId: ep.id, event, payload: payload as never, statusCode, responseBody, success },
      }).catch(() => {});

      if (!success) {
        await prisma.webhookEndpoint.update({
          where: { id: ep.id },
          data: { failCount: { increment: 1 } },
        }).catch(() => {});
      } else {
        await prisma.webhookEndpoint.update({
          where: { id: ep.id },
          data: { failCount: 0, lastTriggeredAt: new Date() },
        }).catch(() => {});
      }
    }),
  );
}
