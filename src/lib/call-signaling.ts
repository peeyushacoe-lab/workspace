import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

// ─── 1:1 DM voice/video call signaling ──────────────────────────────────────
// Media is carried by Jitsi; this module only handles the ring/accept/decline
// handshake over Redis pub/sub. Each user has a personal signal channel so they
// can be rung from anywhere in the app (not just while viewing that DM).

export type CallMedia = "audio" | "video";

export type CallParty = { id: string; name: string };

export type ActiveCall = {
  callId: string;
  channelId: string;
  roomName: string;
  media: CallMedia;
  caller: CallParty;
  callee: CallParty;
  // Everyone allowed in this call (caller + invitees). Used for authz and so
  // group calls can ring multiple people.
  participantIds: string[];
  isGroup: boolean;
  createdAt: number;
};

export type CallLogStatus = "missed" | "ended";

export type CallSignal =
  | { type: "call.incoming"; data: ActiveCall }
  | { type: "call.accepted"; data: { callId: string; roomName: string } }
  | { type: "call.declined"; data: { callId: string } }
  | { type: "call.cancelled"; data: { callId: string } }
  | { type: "call.ended"; data: { callId: string } };

// Invite lives for 60s — long enough to ring, short enough to auto-expire a
// missed call so a stale room name can't be reused.
const INVITE_TTL_SECONDS = 60;

export function userCallChannel(userId: string): string {
  return "call:user:" + userId;
}

function activeKey(callId: string): string {
  return "call:active:" + callId;
}

// Polling-fallback keys. Redis pub/sub → long-lived SSE delivery is unreliable
// on serverless (Vercel + Upstash), so we also let clients poll: each ringing
// callee has a `pending` pointer to the callId, and each call has a `result`
// once it resolves, so the caller can learn the outcome by polling too.
function pendingKey(userId: string): string {
  return "call:pending:" + userId;
}
function resultKey(callId: string): string {
  return "call:result:" + callId;
}

export type CallResult = "accepted" | "declined" | "ended";

export async function setPending(userId: string, callId: string): Promise<void> {
  await redis.set(pendingKey(userId), callId, "EX", INVITE_TTL_SECONDS).catch(() => {});
}
export async function getPending(userId: string): Promise<string | null> {
  return redis.get(pendingKey(userId)).catch(() => null);
}
export async function clearPending(userId: string): Promise<void> {
  await redis.del(pendingKey(userId)).catch(() => {});
}
export async function setCallResult(callId: string, result: CallResult): Promise<void> {
  await redis.set(resultKey(callId), result, "EX", 120).catch(() => {});
}
export async function getCallResult(callId: string): Promise<string | null> {
  return redis.get(resultKey(callId)).catch(() => null);
}

export async function publishCall(userId: string, signal: CallSignal): Promise<void> {
  await redis
    .publish(userCallChannel(userId), JSON.stringify(signal))
    .catch((err: Error) => console.error("[call] publish failed:", err.message));
}

export async function storeActiveCall(call: ActiveCall): Promise<void> {
  await redis
    .set(activeKey(call.callId), JSON.stringify(call), "EX", INVITE_TTL_SECONDS)
    .catch((err: Error) => console.error("[call] store failed:", err.message));
}

export async function getActiveCall(callId: string): Promise<ActiveCall | null> {
  const raw = await redis.get(activeKey(callId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveCall;
  } catch {
    return null;
  }
}

export async function clearActiveCall(callId: string): Promise<void> {
  await redis.del(activeKey(callId)).catch(() => {});
}

// Posts a call-log message (missed / ended) into the conversation so the call
// shows up in history. Rendered as a system pill by ChatView via the
// "[CALL_LOG] " content marker. Only used for 1:1 DMs (group is too noisy).
export async function postCallLog(call: ActiveCall, status: CallLogStatus): Promise<void> {
  try {
    const content = "[CALL_LOG] " + JSON.stringify({ status, media: call.media });
    const message = await prisma.chatMessage.create({
      data: { channelId: call.channelId, userId: call.caller.id, content },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
        reactions: true,
        replies: { select: { id: true } },
      },
    });
    await redis
      .publish("chat:channel:" + call.channelId, JSON.stringify({ type: "message", data: message }))
      .catch(() => {});
  } catch (err) {
    console.error("[call] call-log post failed:", (err as Error).message);
  }
}
