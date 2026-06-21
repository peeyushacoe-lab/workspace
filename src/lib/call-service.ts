import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  type ActiveCall,
  type CallMedia,
  clearActiveCall,
  getActiveCall,
  postCallLog,
  publishCall,
  storeActiveCall,
} from "@/lib/call-signaling";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";

// Shared call orchestration used by BOTH the web (cookie-auth) and mobile
// (JWT-auth) route handlers so the two clients behave identically.

export type CallAction = "accept" | "decline" | "cancel" | "end";

type StartResult = { call?: ActiveCall; error?: string; status?: number };
type SignalResult = { ok: boolean; stale?: boolean; error?: string; status?: number };

export async function startCallForUser(params: {
  channelId: string;
  callerId: string;
  callerName?: string;
  media: CallMedia;
}): Promise<StartResult> {
  const { channelId, callerId, media } = params;

  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    include: { members: { include: { user: { select: { id: true, fullName: true } } } } },
  });
  if (!channel) return { error: "Channel not found", status: 404 };
  if (channel.type !== "DIRECT" && channel.type !== "GROUP") {
    return { error: "Calls are only supported in direct messages and groups", status: 400 };
  }
  if (!channel.members.some((m) => m.userId === callerId)) {
    return { error: "Forbidden", status: 403 };
  }

  const others = channel.members.filter((m) => m.userId !== callerId);
  if (others.length === 0) {
    return { error: "No other participant in this conversation", status: 400 };
  }

  const callerName =
    params.callerName ??
    channel.members.find((m) => m.userId === callerId)?.user?.fullName ??
    "Someone";

  const isGroup = channel.type === "GROUP";
  const callId = randomUUID();
  const call: ActiveCall = {
    callId,
    channelId,
    roomName: "cybersage-call-" + callId,
    media,
    caller: { id: callerId, name: callerName },
    callee: isGroup
      ? { id: "", name: channel.name }
      : { id: others[0].userId, name: others[0].user?.fullName ?? "Unknown" },
    participantIds: channel.members.map((m) => m.userId),
    isGroup,
    createdAt: Date.now(),
  };

  await storeActiveCall(call);
  await Promise.all(others.map((m) => publishCall(m.userId, { type: "call.incoming", data: call })));
  // Ring mobile devices too (fire-and-forget) so backgrounded users still get
  // an incoming-call notification.
  void pushIncomingCall(call, others.map((m) => m.userId));

  return { call };
}

async function pushIncomingCall(call: ActiveCall, recipientIds: string[]): Promise<void> {
  try {
    const tokenLists = await Promise.all(recipientIds.map((id) => getTokensForUser(id)));
    const tokens = tokenLists.flat();
    if (!tokens.length) return;
    await sendExpoPush(tokens, {
      title: "Incoming " + (call.media === "video" ? "video" : "voice") + " call",
      body: call.isGroup
        ? call.caller.name + " is calling " + call.callee.name
        : call.caller.name + " is calling you",
      data: {
        type: "call",
        kind: "call.incoming",
        callId: call.callId,
        roomName: call.roomName,
        media: call.media,
        channelId: call.channelId,
        callerName: call.caller.name,
      },
    });
  } catch {
    /* push is best-effort */
  }
}

export async function applyCallSignal(params: {
  callId: string;
  userId: string;
  action: CallAction;
}): Promise<SignalResult> {
  const { callId, userId, action } = params;

  const call = await getActiveCall(callId);
  if (!call) return { ok: true, stale: true };

  const isCaller = call.caller.id === userId;
  if (!call.participantIds.includes(userId)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  switch (action) {
    case "accept":
      if (isCaller) return { ok: false, error: "The caller cannot accept", status: 403 };
      await publishCall(call.caller.id, {
        type: "call.accepted",
        data: { callId, roomName: call.roomName },
      });
      break;

    case "decline":
      if (isCaller) return { ok: false, error: "The caller cannot decline", status: 403 };
      await publishCall(call.caller.id, { type: "call.declined", data: { callId } });
      if (!call.isGroup) {
        await postCallLog(call, "missed");
        await clearActiveCall(callId);
      }
      break;

    case "cancel":
      if (!isCaller) return { ok: false, error: "Only the caller can cancel", status: 403 };
      await Promise.all(
        call.participantIds
          .filter((id) => id !== call.caller.id)
          .map((id) => publishCall(id, { type: "call.cancelled", data: { callId } })),
      );
      if (!call.isGroup) await postCallLog(call, "missed");
      await clearActiveCall(callId);
      break;

    case "end": {
      const others = call.participantIds.filter((id) => id !== userId);
      await Promise.all(others.map((id) => publishCall(id, { type: "call.ended", data: { callId } })));
      if (!call.isGroup) await postCallLog(call, "ended");
      await clearActiveCall(callId);
      break;
    }

    default:
      return { ok: false, error: "Unknown action", status: 400 };
  }

  return { ok: true };
}
