import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { NotificationType } from "@/generated/prisma/enums";

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link ?? null,
      metadata: data.metadata as unknown as object | undefined,
    },
  });

  await redis.publish(
    `notifications:${data.userId}`,
    JSON.stringify({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      metadata: data.metadata ?? null,
      createdAt: notification.createdAt,
    })
  );
}
