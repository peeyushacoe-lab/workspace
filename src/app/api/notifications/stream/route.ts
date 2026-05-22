import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { createDedicatedRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });

  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          closed = true;
        }
      };

      // Keepalive every 25 s to prevent proxy/load-balancer timeouts
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

      // Try Redis pub/sub; degrade gracefully if unavailable
      let subscriber: ReturnType<typeof createDedicatedRedis> | undefined;
      try {
        subscriber = createDedicatedRedis();

        // Surface errors without crashing
        subscriber.on("error", () => cleanup(subscriber));

        subscriber.on("message", (_ch: string, message: string) => {
          send(`data: ${message}\n\n`);
        });

        await new Promise<void>((resolve, reject) => {
          subscriber!.subscribe(`notifications:${user.id}`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch {
        // Redis unavailable — keep stream open for keepalives only
        cleanup(subscriber);
        subscriber = undefined;
        closed = false; // re-open so keepalive still works
      }

      // Hold the stream open until client disconnects
      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      cleanup(subscriber);
    },

    cancel() {
      closed = true;
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
