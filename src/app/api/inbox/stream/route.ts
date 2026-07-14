import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { createDedicatedRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox/stream — SSE push for "new mail arrived" events.
 *
 * The inbound webhook (/api/webhooks/resend) publishes to `mail:{userId}`
 * the moment a message lands in a mailbox this user owns. InboxView
 * subscribes here to refresh instantly instead of waiting on its polling
 * interval — mirrors the existing /api/notifications/stream + Redis
 * pub/sub pattern already used for the notification bell and doc collab
 * cursors, so it degrades the same way (keepalive-only) if Redis is down.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });

  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try { controller.enqueue(data); } catch { closed = true; }
      };

      const keepalive = setInterval(() => send(":\n\n"), 25_000);

      const cleanup = (subscriber?: ReturnType<typeof createDedicatedRedis>) => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
        if (subscriber) {
          try { subscriber.unsubscribe(); } catch { /* ignore */ }
          try { subscriber.disconnect(); } catch { /* ignore */ }
        }
      };

      abortSignal.addEventListener("abort", () => cleanup(), { once: true });

      let subscriber: ReturnType<typeof createDedicatedRedis> | undefined;
      try {
        subscriber = createDedicatedRedis();
        subscriber.on("error", () => cleanup(subscriber));
        subscriber.on("message", (_ch: string, message: string) => send(`data: ${message}\n\n`));
        await new Promise<void>((resolve, reject) => {
          subscriber!.subscribe(`mail:${user.id}`, (err) => (err ? reject(err) : resolve()));
        });
      } catch {
        cleanup(subscriber);
        subscriber = undefined;
        closed = false; // re-open so keepalive still works
      }

      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      cleanup(subscriber);
    },
    cancel() { closed = true; },
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
