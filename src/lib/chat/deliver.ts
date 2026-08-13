import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { emitEvent } from "@/lib/events";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";
import { sendWebPush } from "@/lib/web-push";
import type { PushSubscriptionJSON } from "@/lib/web-push";
import { shouldNotify } from "@/lib/notif-prefs";
import { createNotification } from "@/lib/notifications";
import { indexingQueue } from "@/lib/queues/indexing.queue";
import { resolveMentions } from "@/lib/chat/mentions";
import { respondAsSage } from "@/lib/chat/sage";

/**
 * Everything that happens when a chat message becomes real.
 *
 * This used to live inline in `POST /api/chat/channels/[id]/messages`. Scheduled
 * Send needs the *same* chain to run from a worker an hour later — the row in
 * Postgres is the least of it, the message also has to hit the Redis pub/sub
 * bridge that feeds every open SSE stream, the Meilisearch index, mobile push,
 * web push, and the in-app notification centre. A scheduled message that only
 * did `chatMessage.create` would appear to work in a manual refresh and be
 * invisible to everyone who had the channel open, unsearchable, and silent.
 *
 * So the chain lives here once and both callers use it. The route keeps
 * authorization and request parsing; this keeps delivery.
 */

export type ChatDeliveryPayload = {
  channelId: string;
  content: string;
  parentId?: string | null;
  quotedMessageId?: string | null;
  isUrgent?: boolean;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  /**
   * Whether `@everyone` is honoured for this send. Comes from org policy via
   * the route; defaults to true so existing callers are unaffected.
   */
  allowBroadcast?: boolean;
};

const MESSAGE_INCLUDE = {
  user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
  reactions: true,
  replies: { select: { id: true } },
  quotedMessage: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      user: { select: { id: true, fullName: true } },
    },
  },
  readBy: {
    select: { userId: true, readAt: true, user: { select: { fullName: true } } },
  },
} as const;

export async function deliverChatMessage(
  sender: { id: string; fullName: string },
  payload: ChatDeliveryPayload,
) {
  const {
    channelId,
    content,
    parentId,
    quotedMessageId,
    isUrgent,
    attachmentUrl,
    attachmentMime,
    attachmentName,
    allowBroadcast = true,
  } = payload;

  // Mentions are resolved here, not in the route and never on the client:
  // `mentionedUserIds` drives who gets notified, so accepting it from the
  // request body would hand any authenticated user an org-wide notification
  // primitive. Resolution is also what makes /connect/activity's mention feed
  // work at all — it queries `mentionedUserIds: { has: userId }`, and until
  // this call existed nothing ever wrote that column.
  const mentions = await resolveMentions({
    content,
    channelId,
    actorId: sender.id,
    allowBroadcast,
  }).catch((err: Error) => {
    // A parser failure must not cost the user their message.
    console.error("[chat/deliver] mention resolution failed:", err.message);
    return null;
  });

  const message = await prisma.chatMessage.create({
    data: {
      channelId,
      userId: sender.id,
      content: content.trim(),
      parentId: parentId ?? null,
      quotedMessageId: quotedMessageId ?? null,
      isUrgent: isUrgent === true,
      mentionedUserIds: mentions?.userIds ?? [],
      ...(attachmentUrl
        ? { attachmentUrl, attachmentMime: attachmentMime ?? null, attachmentName: attachmentName ?? null }
        : {}),
    },
    include: MESSAGE_INCLUDE,
  });

  // Update channel timestamp for ordering — fire-and-forget, not on critical path.
  prisma.chatChannel.update({
    where: { id: channelId },
    data: { updatedAt: new Date() },
    select: { id: true },
  }).catch(() => {});

  // Broadcast to SSE subscribers via Redis pub/sub — non-fatal if Redis is unavailable
  await redis
    .publish(`chat:channel:${channelId}`, JSON.stringify({ type: "message", data: message }))
    .catch((err: Error) => {
      console.error("[chat/deliver] Redis publish failed:", err.message);
    });

  emitEvent("CHAT_MESSAGE_CREATED", {
    channelId,
    messageId: message.id,
    actorId: sender.id,
    hasAttachment: false,
    content: content.trim().slice(0, 200),
  });

  // Queue for full-text search indexing — fire-and-forget
  if (content.trim()) {
    indexingQueue.add("index-chat-message", {
      type: "INDEX",
      resource: "chat_message",
      resourceId: message.id,
      content: content.trim(),
      metadata: {
        channelId,
        senderName: sender.fullName,
        createdAt: message.createdAt.toISOString(),
      },
    }).catch(() => {});
  }

  void fanOutNotifications(sender, {
    channelId,
    content,
    isUrgent,
    attachmentName,
    mentionedUserIds: mentions?.userIds ?? [],
  });

  // @Sage is fired from here rather than from the route for the same reason
  // every other side effect is: scheduled sends and send-now must summon the
  // assistant too, and a copy of this in each caller would drift. It is
  // deliberately not awaited — the sender's POST should not block on an LLM.
  if (mentions?.sage) {
    void respondAsSage({
      channelId,
      askedBy: sender,
      prompt: mentions.sage.prompt,
      parentId: parentId ?? null,
    });
  }

  return message;
}

/** Push + in-app notification fan-out to everyone in the channel but the sender. */
async function fanOutNotifications(
  sender: { id: string; fullName: string },
  {
    channelId,
    content,
    isUrgent,
    attachmentName,
    mentionedUserIds = [],
  }: {
    channelId: string;
    content: string;
    isUrgent?: boolean;
    attachmentName?: string | null;
    mentionedUserIds?: string[];
  },
) {
  try {
    const [members, channel] = await Promise.all([
      prisma.chatMember.findMany({
        where: { channelId, NOT: { userId: sender.id } },
        select: { userId: true },
      }).catch(() => [] as { userId: string }[]),
      prisma.chatChannel.findUnique({
        where: { id: channelId },
        select: { name: true, type: true },
      }).catch(() => null),
    ]);

    const memberIds = members.map((m) => m.userId);
    const displayContent = (content.trim() || attachmentName || "Attachment").slice(0, 100);
    const pushTitle = `${isUrgent ? "🚨 " : ""}#${channel?.name ?? "Chat"}: ${sender.fullName}`;

    // Expo mobile push
    const tokenArrays = await Promise.all(members.map((m) => getTokensForUser(m.userId)));
    const allTokens = tokenArrays.flat();
    if (allTokens.length) {
      await sendExpoPush(allTokens, {
        title: pushTitle,
        body: displayContent,
        data: { type: "chat", channelId },
      });
    }

    // Web push — always for DMs, urgent messages, and anyone explicitly
    // mentioned. Being named in a channel is the whole reason mentions exist:
    // before this, an @mention in a normal group channel produced no push and
    // no in-app notification, so the only way to discover one was to already
    // be reading the channel.
    const isDM = channel?.type === "DIRECT";
    const mentioned = new Set(mentionedUserIds);
    if (!(isDM || isUrgent || mentioned.size) || !memberIds.length) return;

    const memberUsers = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, preferences: true },
    }).catch(() => [] as { id: string; preferences: unknown }[]);
    const prefsByUserId = new Map(memberUsers.map((u) => [u.id, (u.preferences ?? {}) as Record<string, unknown>]));

    // notifType: DM → chatMentions, group channel → chatMentions (both use same key)
    const notifType = "chatMentions" as const;

    // Who this message is actually *for*. A DM or an urgent message addresses
    // the whole conversation; an ordinary message that merely contains a
    // mention addresses only the people named. Widening this to `memberIds`
    // would turn one `@Priya` into a notification for all 40 channel members,
    // which is precisely the behaviour that trains people to mute channels.
    const recipientIds =
      isDM || isUrgent ? memberIds : memberIds.filter((id) => mentioned.has(id));
    if (!recipientIds.length) return;

    // In-app notification — creates a Notification row AND publishes to the
    // per-user Redis channel that feeds the app-wide NotificationCenter SSE
    // stream. This is what makes a new DM / urgent message pop up on screen
    // no matter which page the recipient is on. `metadata.urgent` drives the
    // persistent urgent prompt; `metadata.channelId` lets the client suppress
    // the popup when the recipient is already viewing that conversation.
    const inAppIds = recipientIds.filter((id) => shouldNotify(prefsByUserId.get(id) ?? {}, notifType, "inApp"));
    await Promise.all(
      inAppIds.map((recipientId) =>
        createNotification({
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: isUrgent
            ? isDM
              ? `Urgent message from ${sender.fullName}`
              : `Urgent in #${channel?.name ?? "channel"} — ${sender.fullName}`
            : mentioned.has(recipientId) && !isDM
              ? `${sender.fullName} mentioned you in #${channel?.name ?? "channel"}`
              : `New message from ${sender.fullName}`,
          body: displayContent,
          // Route to the page that actually lists this conversation kind —
          // Connect splits DMs, groups and channels into separate sections.
          link: `${
            channel?.type === "CHANNEL" ? "/connect/channels"
            : channel?.type === "GROUP" ? "/connect/groups"
            : "/connect/chat"
          }?channel=${channelId}`,
          metadata: {
            channelId,
            urgent: isUrgent === true,
            senderId: sender.id,
            mention: mentioned.has(recipientId),
          },
        }).catch(() => {})
      )
    );

    const eligibleIds = recipientIds.filter((id) => shouldNotify(prefsByUserId.get(id) ?? {}, notifType, "push"));
    if (!eligibleIds.length) return;

    const pushLogs = await prisma.auditLog.findMany({
      where: { actorId: { in: eligibleIds }, action: "PUSH_SUBSCRIBE" },
      select: { id: true, actorId: true, metadata: true },
    }).catch(() => []);
    const stale: string[] = [];
    await Promise.all(
      pushLogs.map(async (log) => {
        const sub = log.metadata as unknown as PushSubscriptionJSON;
        if (!sub?.endpoint) return;
        try {
          await sendWebPush(sub, {
            title: isDM ? `💬 ${sender.fullName}` : pushTitle,
            body: displayContent,
            url: "/connect/chat",
            tag: `chat-${channelId}`,
          });
        } catch {
          stale.push(log.id);
        }
      })
    );
    if (stale.length) {
      await prisma.auditLog.deleteMany({ where: { id: { in: stale } } }).catch(() => {});
    }
  } catch (err) {
    // Notification fan-out is never allowed to fail a send.
    console.error("[chat/deliver] notification fan-out failed:", err instanceof Error ? err.message : err);
  }
}
