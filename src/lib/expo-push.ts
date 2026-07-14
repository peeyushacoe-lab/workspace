import { prisma } from "./prisma";
import { logger } from "./logger";

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

export async function getTokensForUser(userId: string): Promise<string[]> {
  const rows = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { token: true },
  }).catch(() => []);
  return rows.map((r) => r.token);
}

/** Computes the caller's unread inbox count for use as the iOS/Android app badge. */
export async function getUnreadBadgeCount(userId: string): Promise<number> {
  const count = await prisma.inboxThread.count({
    where: {
      isTrashed: false,
      isArchived: false,
      mailbox: { accessLogs: { some: { userId } } },
      messages: { some: { isRead: false } },
    },
  }).catch(() => 0);
  return count;
}

export async function sendExpoPush(
  tokens: string[],
  payload: Omit<ExpoMessage, "to">,
): Promise<void> {
  if (!tokens.length) return;
  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    sound: "default",
    ...payload,
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "[expo-push] send request failed");
      return;
    }

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data ?? [];

    // Tickets are returned in the same order as `messages` — walk both
    // in lockstep so we know which physical token a given error belongs to.
    const deadTokens: string[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === "error") {
        const errorCode = ticket.details?.error;
        logger.warn({ token: messages[i]?.to, error: ticket.message, errorCode }, "[expo-push] delivery ticket error");
        if (errorCode === "DeviceNotRegistered" && messages[i]) {
          deadTokens.push(messages[i].to);
        }
      }
    });

    if (deadTokens.length > 0) {
      await prisma.mobilePushToken.deleteMany({ where: { token: { in: deadTokens } } }).catch(() => {});
      logger.info({ count: deadTokens.length }, "[expo-push] pruned stale device tokens");
    }
  } catch (err) {
    logger.error({ err }, "[expo-push] send failed");
  }
}
