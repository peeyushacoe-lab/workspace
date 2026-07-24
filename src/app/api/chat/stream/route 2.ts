import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDedicatedRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * User-level chat SSE stream — subscribes to ALL channels the user is a member of.
 *
 * The per-channel stream (/api/chat/channels/[id]/stream) only covers the channel
 * currently open in the UI, so messages arriving in OTHER channels (e.g. a DM you
 * don't have selected) were invisible until a full reload: no unread badge, no
 * popup. This stream is the transport for those — the client uses it to bump
 * unread counts, reorder the channel list, and surface new-message popups.
 *
 * Membership is snapshotted at connect time. EventSource reconnects periodically
 * (Vercel's function duration cap forces this), so newly created channels are
 * picked up on the next reconnect; the client additionally refreshes its channel
 * list on a slow poll as a safety net.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });

  const memberships = await prisma.chatMember.findMany({
    where: { userId: user.id },
    select: { channelId: true },
  });
  const channelKeys = memberships.map((m) => `chat:channel:${m.channelId}`);

  // Pub/sub requires its own connection — never share with the command client.
  const subscriber = createDedicatedRedis();
  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
        try { subscriber.unsubscribe(); } catch { /* ignore */ }
        try { subscriber.disconnect(); } catch { /* ignore */ }
      };

      // Heartbeat every 25s to prevent proxy/LB timeouts
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(":\n\n");
        } catch {
          cleanup();
        }
      }, 25_000);

      abortSignal.addEventListener("abort", cleanup, { once: true });

      send("connected", { userId: user.id, channels: memberships.length });

      if (channelKeys.length === 0) return;

      subscriber.on("message", (channel: string, message: string) => {
        try {
          const channelId = channel.slice("chat:channel:".length);
          const parsed = JSON.parse(message) as { type: string; data: unknown };
          // Re-emit with the source channel id so the client can route it
          send(parsed.type, { ...(parsed.data as object), channelId });
        } catch {
          // ignore malformed messages
        }
      });

      subscriber.on("error", cleanup);

      subscriber.subscribe(...channelKeys, (err) => {
        if (err) cleanup();
      });
    },
    cancel() {
      closed = true;
      try { subscriber.unsubscribe(); } catch { /* ignore */ }
      try { subscriber.disconnect(); } catch { /* ignore */ }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
