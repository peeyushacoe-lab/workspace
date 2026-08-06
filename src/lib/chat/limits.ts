import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Rate limits for Connect.
 *
 * Before this, no chat, team or channel endpoint had any limit at all — the
 * only rate-limited surfaces in the app were auth, AI and Drive upload. That
 * left a few things wide open:
 *
 *   - `POST /typing` publishes to Redis on every call, and every publish fans
 *     out to every open SSE subscriber on that channel. One client in a loop
 *     is an amplification attack against everyone in the room, not just the
 *     server.
 *   - Message send writes a row, indexes it, and fans out mobile push, web
 *     push and in-app notifications per recipient. In a 200-person channel one
 *     request is ~600 downstream operations.
 *   - Call start rings a person's phone. Unbounded, that is a harassment tool.
 *
 * Budgets are deliberately generous — well above what a fast human produces,
 * low enough that a script gets stopped in seconds. They live in one table so
 * they can be reasoned about together rather than rediscovered per route.
 */

export type ChatLimitAction =
  | "message.send"
  | "message.edit"
  | "message.react"
  | "message.pin"
  | "typing"
  | "read.mark"
  | "channel.create"
  | "member.add"
  | "tab.create"
  | "scheduled.create"
  | "call.start";

/** [max requests, window in seconds] */
const LIMITS: Record<ChatLimitAction, [number, number]> = {
  // A person sending 40 messages in a minute is already unusual; 40 is the
  // ceiling for paste-heavy bursts, not the expected rate.
  "message.send": [40, 60],
  "message.edit": [30, 60],
  "message.react": [60, 60],
  "message.pin": [30, 60],
  // Client debounces typing to roughly one ping per 3s (~20/min), so this is
  // 6× headroom — it only bites on a loop.
  typing: [120, 60],
  "read.mark": [120, 60],
  // Creation is rare and each one seeds a member row per participant.
  "channel.create": [20, 3600],
  "member.add": [30, 3600],
  "tab.create": [40, 3600],
  "scheduled.create": [60, 3600],
  // Ringing someone is the most intrusive thing chat can do.
  "call.start": [20, 3600],
};

const MESSAGES: Partial<Record<ChatLimitAction, string>> = {
  "message.send": "You're sending messages too quickly. Give it a moment.",
  "call.start": "Too many call attempts. Try again a little later.",
  "channel.create": "You've created a lot of conversations recently. Try again later.",
  "member.add": "Too many member changes. Try again later.",
  "scheduled.create": "Too many scheduled messages. Try again later.",
};

/**
 * Returns a 429 `NextResponse` when the caller is over budget, or `null` when
 * they're clear. Call it right after the auth check and before any work:
 *
 *   const limited = await enforceChatLimit("message.send", user.id);
 *   if (limited) return limited;
 *
 * Keyed per user rather than per IP — everything here is behind a session, and
 * an IP key would throttle a whole office behind one NAT together.
 */
export async function enforceChatLimit(
  action: ChatLimitAction,
  userId: string,
  /** Optional extra scope, e.g. a channel id, when a per-conversation budget
   *  makes more sense than a global one. */
  scope?: string,
): Promise<NextResponse | null> {
  const [limit, windowSeconds] = LIMITS[action];
  const key = scope ? `chat:${action}:${userId}:${scope}` : `chat:${action}:${userId}`;
  const { allowed, retryAfter } = await checkRateLimit(key, limit, windowSeconds);
  if (allowed) return null;

  return NextResponse.json(
    { error: MESSAGES[action] ?? "Too many requests. Try again shortly.", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Same budget check for handlers that return a bare `Response` rather than a
 * `NextResponse` (the call routes use `Response.json`). Returns `null` when
 * clear.
 */
export async function checkChatLimit(
  action: ChatLimitAction,
  userId: string,
): Promise<{ retryAfter: number } | null> {
  const [limit, windowSeconds] = LIMITS[action];
  const { allowed, retryAfter } = await checkRateLimit(`chat:${action}:${userId}`, limit, windowSeconds);
  return allowed ? null : { retryAfter };
}
